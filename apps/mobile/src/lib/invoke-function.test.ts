import { FunctionsHttpError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  getSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
};
vi.mock("./supabase", () => ({ supabase: { auth } }));

const { functionErrorMessage, signOutIfSessionRevoked, SIGNED_OUT_MESSAGE } = await import("./invoke-function");

function httpError(status: number, body: unknown) {
  return new FunctionsHttpError(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
  auth.getUser.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
});

describe("functionErrorMessage", () => {
  it("returns the function's own { error } message instead of the generic one", async () => {
    expect(await functionErrorMessage(httpError(400, { error: "Pickup time is required for Three's Kitchen" }))).toBe(
      "Pickup time is required for Three's Kitchen"
    );
  });

  it("signs this phone out and says so when a 401 comes from a cancelled sign-in", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthApiError", status: 403 } });
    expect(await functionErrorMessage(httpError(401, { error: "Not signed in" }))).toBe(SIGNED_OUT_MESSAGE);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("keeps the session and shows the message when a 401 isn't about the sign-in", async () => {
    expect(await functionErrorMessage(httpError(401, { error: "Missing Authorization header" }))).toBe(
      "Missing Authorization header"
    );
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("falls back to a plain Error's message", async () => {
    expect(await functionErrorMessage(new Error("Failed to send a request"))).toBe("Failed to send a request");
  });
});

describe("signOutIfSessionRevoked", () => {
  it("does nothing when signed out already", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    expect(await signOutIfSessionRevoked()).toBe(false);
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("never signs out on a network failure", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthRetryableFetchError", status: 0 } });
    expect(await signOutIfSessionRevoked()).toBe(false);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("signs out locally when the server rejects the session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthApiError", status: 401 } });
    expect(await signOutIfSessionRevoked()).toBe(true);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
