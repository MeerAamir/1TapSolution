/**
 * Headers for calling the Supabase Data API with a project key.
 * New publishable/secret keys (sb_publishable_…, sb_secret_…) are not JWTs and
 * must only be sent in the `apikey` header. Legacy anon/service_role keys are
 * JWTs and are also accepted as a Bearer token. Supports both.
 */
export function supabaseKeyHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: key }
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`
  return headers
}
