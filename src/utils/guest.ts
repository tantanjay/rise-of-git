/** "Look around without signing in" (only offered when the server allows GUEST_BROWSING), remembered for this browser tab */
const GUEST_KEY = "gtc_guest";

export function readGuest(): boolean {
  try {
    return sessionStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
}

export function setGuest(on: boolean) {
  try {
    if (on) sessionStorage.setItem(GUEST_KEY, "1");
    else sessionStorage.removeItem(GUEST_KEY);
  } catch {
    // private mode: the choice lasts until reload
  }
}
