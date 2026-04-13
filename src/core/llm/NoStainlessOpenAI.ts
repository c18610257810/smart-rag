import OpenAI from 'openai'

/**
 * NoStainlessOpenAI - Previously stripped x-stainless headers.
 * In OpenAI SDK v6, FinalRequestOptions is no longer exported.
 * This class now just extends OpenAI directly (headers remain).
 */
export class NoStainlessOpenAI extends OpenAI {
  // Note: buildRequest override removed - FinalRequestOptions no longer exported in openai v6
}
