import 'isomorphic-fetch'
import { Client, type AuthenticationProvider } from '@microsoft/microsoft-graph-client'
import { acquireTokenSilent } from '../auth/microsoft'

class HomeAccountAuthProvider implements AuthenticationProvider {
  constructor(
    private readonly clientId: string,
    private readonly homeAccountId: string
  ) {}

  async getAccessToken(): Promise<string> {
    const token = await acquireTokenSilent(this.clientId, this.homeAccountId)
    return token.accessToken
  }
}

export function createGraphClient(clientId: string, homeAccountId: string): Client {
  const authProvider = new HomeAccountAuthProvider(clientId, homeAccountId)
  return Client.initWithMiddleware({ authProvider })
}

export interface MeProfile {
  id: string
  displayName: string
  mail: string | null
  userPrincipalName: string
  jobTitle: string | null
}

export async function getMe(clientId: string, homeAccountId: string): Promise<MeProfile> {
  const client = createGraphClient(clientId, homeAccountId)
  const me = (await client
    .api('/me')
    .select(['id', 'displayName', 'mail', 'userPrincipalName', 'jobTitle'])
    .get()) as MeProfile
  return me
}
