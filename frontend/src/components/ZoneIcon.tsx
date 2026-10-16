import type { ZoneId } from "@aura/contracts";

const paths: Record<ZoneId, string> = {
  studio: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  hardware: "M7 7h10v10H7V7Zm3 3h4v4h-4v-4ZM9 3v4m6-4v4M9 17v4m6-4v4M3 9h4m-4 6h4m10-6h4m-4 6h4",
  software: "m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16",
  "ai-lab": "M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8M5.6 18.4l2.8-2.8m7.2-7.2 2.8-2.8M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  github: "M7 8v8m0-12a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10-12a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM17 8v2a4 4 0 0 1-4 4H7",
  companion: "M12 2c0 6-4 10-10 10 6 0 10 4 10 10 0-6 4-10 10-10-6 0-10-4-10-10Z",
};

export function ZoneIcon({ zone, size = 18 }: { zone: ZoneId; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"><path d={paths[zone]} /></svg>;
}
