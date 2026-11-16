export function isProjectRangeValid(startsAt: string, endsAt: string): boolean {
  return !startsAt || !endsAt || endsAt >= startsAt;
}
