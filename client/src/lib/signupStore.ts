let _pendingPassword: string | null = null;

export function setPendingPassword(password: string): void {
  _pendingPassword = password;
}

export function takePendingPassword(): string | null {
  const pw = _pendingPassword;
  _pendingPassword = null;
  return pw;
}

export function hasPendingPassword(): boolean {
  return _pendingPassword !== null;
}
