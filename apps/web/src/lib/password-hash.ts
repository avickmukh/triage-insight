/**
 * password-hash.ts
 *
 * Client-side SHA-256 password hashing using the Web Crypto API.
 *
 * WHY: Hashing the password on the client before transmission ensures that the
 * raw password never appears in the network payload — even in browser DevTools.
 * The server then applies bcrypt on top of the SHA-256 hash, so the stored hash
 * is bcrypt(sha256(password)), providing two layers of hashing.
 *
 * SECURITY PROPERTIES:
 *  - The raw password never leaves the browser
 *  - The SHA-256 hash is deterministic, so the server can verify it with bcrypt
 *  - bcrypt on the server adds a random salt and work factor, preventing
 *    rainbow-table attacks against the SHA-256 hash
 *  - The Web Crypto API is available in all modern browsers and Node.js 15+
 *
 * MIGRATION: The backend supports a dual-mode comparison during the transition
 * period. Existing users (passwordVersion = 0) are verified with bcrypt against
 * the raw password, then their hash is silently upgraded to version 1 on login.
 * New users and password resets always use version 1 (bcrypt(sha256(password))).
 */

/**
 * Hash a password with SHA-256 using the Web Crypto API.
 * Returns a lowercase hex string (64 characters).
 *
 * @param password - The raw password string entered by the user
 * @returns A hex-encoded SHA-256 hash of the password
 */
export async function hashPasswordForTransmission(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
