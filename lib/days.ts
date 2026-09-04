/** 7 October 2023, 06:29 Asia/Jerusalem — the minute the day began. */
export const START = Date.UTC(2023, 9, 7, 3, 29);
export const daysSince = () => Math.floor((Date.now() - START) / 864e5);
