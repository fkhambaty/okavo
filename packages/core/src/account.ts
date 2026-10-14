export const ACCOUNT_DELETION_PHRASE = "DELETE MY OKAVO ACCOUNT";

export function confirmationMatches(value: string): boolean {
  return value.trim() === ACCOUNT_DELETION_PHRASE;
}
