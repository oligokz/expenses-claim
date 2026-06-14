import {
  PublicClientApplication,
  type AccountInfo,
} from "@azure/msal-browser"
import { AUTH, API_SCOPE } from "./constants"

let msalInstance: PublicClientApplication | null = null
let account: AccountInfo | null = null

/**
 * Initialise MSAL and ensure the user is signed in.
 * Returns the signed-in account, or null while redirecting to the sign-in page.
 */
export async function initAuth(): Promise<AccountInfo | null> {
  msalInstance = new PublicClientApplication({
    auth: {
      clientId: AUTH.clientId,
      authority: `https://login.microsoftonline.com/${AUTH.tenantId}`,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: "sessionStorage" },
  })

  await msalInstance.initialize()

  const resp = await msalInstance.handleRedirectPromise()
  if (resp && resp.account) {
    account = resp.account
  } else {
    const all = msalInstance.getAllAccounts()
    if (all.length) account = all[0]
  }

  if (!account) {
    await msalInstance.loginRedirect({ scopes: [API_SCOPE] })
    return null // navigating away to sign in
  }

  msalInstance.setActiveAccount(account)
  return account
}

/** Sign the user out and return to the app origin. */
export async function logout(): Promise<void> {
  if (!msalInstance) return
  await msalInstance.logoutRedirect({
    postLogoutRedirectUri: window.location.origin,
  })
}

/** Acquire a fresh access token for our own API. Bounces through interactive auth if needed. */
export async function getApiToken(): Promise<string> {
  if (!msalInstance || !account) throw new Error("Not authenticated")
  try {
    const r = await msalInstance.acquireTokenSilent({
      scopes: [API_SCOPE],
      account,
    })
    return r.accessToken
  } catch {
    await msalInstance.acquireTokenRedirect({ scopes: [API_SCOPE] })
    throw new Error("Re-authenticating")
  }
}
