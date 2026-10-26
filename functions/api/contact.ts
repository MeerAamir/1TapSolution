import { handleContactRequest, type EdgeEnv } from '../../src/lib/edge/handlers'

export const onRequest: PagesFunction<EdgeEnv> = (context) => handleContactRequest(context.request, context.env)
