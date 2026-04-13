// @ts-nocheck - drizzle-orm/pglite not installed
import { PGlite, type PGliteOptions } from '@electric-sql/pglite'
import { PgliteDatabase, drizzle } from 'drizzle-orm/pglite'
import { App, normalizePath, requestUrl } from 'obsidian'

import { PGLITE_DB_PATH } from '../constants'

import { PGLiteAbortedException } from './exception'
// @ts-ignore - resolveJsonModule
import migrations from './migrations.json'
import { LegacyTemplateManager } from './modules/template/TemplateManager'
import { VectorManager } from './modules/vector/VectorManager'

/**
 * Create a vector extension object that fetches vector.tar.gz from CDN at runtime.
 *
 * The stock `import { vector } from '@electric-sql/pglite/vector'` relies on
 * `import.meta.url` / `__filename` to resolve `../vector.tar.gz` at runtime.
 * After esbuild bundles everything into a single `main.js`, that relative path
 * resolves to the Obsidian plugins directory where `vector.tar.gz` doesn't exist.
 *
 * Instead, we fetch the tar.gz from unpkg at runtime and pass the Blob directly
 * to the extension setup, bypassing the broken URL resolution.
 */
async function createVectorExtension() {
  const PGLITE_VERSION = '0.2.12'
  const vectorTarUrl =
    `https://unpkg.com/@electric-sql/pglite@${PGLITE_VERSION}/dist/vector.tar.gz`

  return {
    name: 'pgvector',
    // PGlite extension setup: return emscriptenOpts + bundlePath.
    // Instead of a relative URL (which breaks after bundling), we fetch
    // the tar.gz ourselves and pass it as a blob URL.
    // Uses Obsidian's requestUrl API (bypasses CORS/CDN restrictions).
    setup: async (emscriptenOpts: unknown) => {
      const resp = await requestUrl(vectorTarUrl)
      const blob = new Blob([resp.arrayBuffer], { type: 'application/gzip' })
      const blobUrl = URL.createObjectURL(blob)
      return {
        emscriptenOpts,
        bundlePath: new URL(blobUrl),
      }
    },
  }
}

export class DatabaseManager {
  private app: App
  private dbPath: string
  private pgClient: PGlite | null = null
  private db: PgliteDatabase | null = null
  // WeakMap to prevent circular references
  private static managers = new WeakMap<
    DatabaseManager,
    {
      templateManager?: LegacyTemplateManager
      vectorManager?: VectorManager
    }
  >()

  constructor(app: App, dbPath: string) {
    this.app = app
    this.dbPath = dbPath
  }

  static async create(app: App): Promise<DatabaseManager> {
    const dbManager = new DatabaseManager(app, normalizePath(PGLITE_DB_PATH))
    dbManager.db = await dbManager.loadExistingDatabase()
    if (!dbManager.db) {
      dbManager.db = await dbManager.createNewDatabase()
    }
    await dbManager.migrateDatabase()
    await dbManager.save()

    // WeakMap setup
    const managers = {
      vectorManager: new VectorManager(app, dbManager.db),
      templateManager: new LegacyTemplateManager(app, dbManager.db),
    }

    // save, vacuum callback setup
    const saveCallback = dbManager.save.bind(dbManager) as () => Promise<void>
    const vacuumCallback = dbManager.vacuum.bind(
      dbManager,
    ) as () => Promise<void>

    managers.vectorManager.setSaveCallback(saveCallback)
    managers.vectorManager.setVacuumCallback(vacuumCallback)
    managers.templateManager.setSaveCallback(saveCallback)
    managers.templateManager.setVacuumCallback(vacuumCallback)

    DatabaseManager.managers.set(dbManager, managers)


    return dbManager
  }

  getDb() {
    return this.db
  }

  getVectorManager(): VectorManager {
    const managers = DatabaseManager.managers.get(this) ?? {}
    if (!managers.vectorManager) {
      if (this.db) {
        managers.vectorManager = new VectorManager(this.app, this.db)
        DatabaseManager.managers.set(this, managers)
      } else {
        throw new Error('Database is not initialized')
      }
    }
    return managers.vectorManager
  }

  getTemplateManager(): LegacyTemplateManager {
    const managers = DatabaseManager.managers.get(this) ?? {}
    if (!managers.templateManager) {
      if (this.db) {
        managers.templateManager = new LegacyTemplateManager(this.app, this.db)
        DatabaseManager.managers.set(this, managers)
      } else {
        throw new Error('Database is not initialized')
      }
    }
    return managers.templateManager
  }

  // vacuum the database to release unused space
  async vacuum() {
    if (!this.pgClient) {
      return
    }
    await this.pgClient.query('VACUUM FULL;')
  }

  private async createNewDatabase() {
    try {
      const { fsBundle, wasmModule, vectorExtension } =
        await this.loadPGliteResources()
      // PGlite 0.2.12 uses new PGlite() with wasmModule + fsBundle
      this.pgClient = new PGlite('memory://', {
        fsBundle: fsBundle,
        wasmModule: wasmModule,
        extensions: {
          vector: vectorExtension,
        },
      })
      // Wait for PGlite to be ready
      await this.pgClient.waitReady
      const db = drizzle(this.pgClient)
      return db
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes(
          'Aborted(). Build with -sASSERTIONS for more info.',
        )
      ) {
        // This error occurs when using an outdated Obsidian installer version
        throw new PGLiteAbortedException()
      }
      throw error
    }
  }

  private async loadExistingDatabase(): Promise<PgliteDatabase | null> {
    try {
      const databaseFileExists = await this.app.vault.adapter.exists(
        this.dbPath,
      )
      if (!databaseFileExists) {
        return null
      }
      const fileBuffer = await this.app.vault.adapter.readBinary(this.dbPath)
      const fileBlob = new Blob([fileBuffer], { type: 'application/x-gzip' })
      const { fsBundle, wasmModule, vectorExtension } =
        await this.loadPGliteResources()
      // PGlite 0.2.12 uses new PGlite() with loadDataDir option
      this.pgClient = new PGlite('memory://', {
        loadDataDir: fileBlob,
        fsBundle: fsBundle,
        wasmModule: wasmModule,
        extensions: {
          vector: vectorExtension,
        },
      })
      await this.pgClient.waitReady
      return drizzle(this.pgClient)
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes(
          'Aborted(). Build with -sASSERTIONS for more info.',
        )
      ) {
        // This error occurs when using an outdated Obsidian installer version
        throw new PGLiteAbortedException()
      }
      return null
    }
  }

  private async migrateDatabase(): Promise<void> {
    try {
      // Workaround for running Drizzle migrations in a browser environment
      // This method uses an undocumented API to perform migrations
      // See: https://github.com/drizzle-team/drizzle-orm/discussions/2532#discussioncomment-10780523
      
      // @ts-expect-error
      await this.db.dialect.migrate(migrations, this.db.session, {
        migrationsTable: 'drizzle_migrations',
      })
    } catch (error) {
      console.error('Error migrating database:', error)
      throw error
    }
  }

  async save(): Promise<void> {
    if (!this.pgClient) {
      return
    }
    try {
      const blob: Blob = await this.pgClient.dumpDataDir('gzip')
      await this.app.vault.adapter.writeBinary(
        this.dbPath,
        await blob.arrayBuffer(),
      )
    } catch (error) {
      console.error('Error saving database:', error)
  }
  }

  async cleanup() {
    // save before cleanup
    await this.save()
    // WeakMap cleanup
    DatabaseManager.managers.delete(this)
    await this.pgClient?.close()
    this.pgClient = null
    this.db = null
  }

  // Load PGlite resources (WASM, fs bundle, vector extension) from CDN
  private async loadPGliteResources(): Promise<{
    fsBundle: Blob
    wasmModule: WebAssembly.Module
    vectorExtension: NonNullable<PGliteOptions['extensions']>['vector']
  }> {
    try {
      const PGLITE_VERSION = '0.2.12'
      const [fsBundleResponse, wasmResponse, vectorExt] =
        await Promise.all([
          requestUrl(
            `https://unpkg.com/@electric-sql/pglite@${PGLITE_VERSION}/dist/postgres.data`,
          ),
          requestUrl(
            `https://unpkg.com/@electric-sql/pglite@${PGLITE_VERSION}/dist/postgres.wasm`,
          ),
          createVectorExtension(),
        ])

      const fsBundle = new Blob([fsBundleResponse.arrayBuffer], {
        type: 'application/octet-stream',
      })
      const wasmModule = await WebAssembly.compile(wasmResponse.arrayBuffer)

      return { fsBundle, wasmModule, vectorExtension: vectorExt }
    } catch (error) {
      console.error('Error loading PGlite resources:', error)
      throw error
    }
  }
}
