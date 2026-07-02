let _pendingPassword: string | null = null;

export function setPendingPassword(password: string): void {
  _pendingPassword = password;
}

export function takePendingPassword(): string | null {
  const pw = _pendingPassword;
  _pendingPassword = null;
  return pw;
}

// Reads the password without consuming it — safe to call from a mutation that
// may be retried (network error, validation error) before it ultimately succeeds.
export function peekPendingPassword(): string | null {
  return _pendingPassword;
}

export function clearPendingPassword(): void {
  _pendingPassword = null;
}

export function hasPendingPassword(): boolean {
  return _pendingPassword !== null;
}
