export const SESSION_EXPIRY_SECONDS = 60 * 60 * 24 * 7;

export const SESSION_REFRESH_AGE_SECONDS = 60 * 60 * 24;

export const SESSION_FRESH_AGE_SECONDS = 60 * 5;

export const SESSION_ABSOLUTE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const MILLISECONDS_PER_SECOND = 1_000;

export function getSessionAbsoluteExpiresAt(createdAt: Date): Date {
  return new Date(
    createdAt.getTime() +
      SESSION_ABSOLUTE_MAX_AGE_SECONDS * MILLISECONDS_PER_SECOND,
  );
}

export function isSessionWithinAbsoluteLifetime(
  createdAt: Date,
  now: Date = new Date(),
): boolean {
  const createdAtMilliseconds = createdAt.getTime();
  const nowMilliseconds = now.getTime();

  if (Number.isNaN(createdAtMilliseconds) || Number.isNaN(nowMilliseconds)) {
    return false;
  }

  if (nowMilliseconds < createdAtMilliseconds) {
    return false;
  }

  return nowMilliseconds < getSessionAbsoluteExpiresAt(createdAt).getTime();
}
