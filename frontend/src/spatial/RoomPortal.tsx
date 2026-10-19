import type { RoomId } from "../world/types.ts";

/** Original vector schematics, not screenshots or live room telemetry. No asset requests. */
export function RoomPortal({ room }: { room: RoomId }) {
  return <svg className="room-portal-art" viewBox="0 0 320 156" fill="none" aria-hidden="true">
    <path className="portal-floor" d="m160 35 122 62-122 48L38 97Z" />
    <path className="portal-wall" d="M38 97V42l122-32v25Zm122-62V10l122 32v55Z" />
    <path className="portal-grid" d="m78 117 121-62m-81 78 122-58M78 75l122 54m-81-75 122 59M38 97l122 48 122-48M160 10v25" />
    {room === "project-hub" && <><path className="portal-solid" d="m67 84 47-16 40 19-47 18Zm109 4 43-19 38 17-42 20Z" /><path className="portal-accent" d="M80 76V47l39-9v28Zm112-11V38l38 10v29ZM108 105v13m106-12v12" /><path className="portal-detail" d="m87 55 22-6m-22 14 15-4m96-12 24 7m-24 1 15 5" /></>}
    {room === "atrium" && <><path className="portal-solid" d="m160 82 41 17-41 18-41-18Z" /><ellipse className="portal-accent" cx="160" cy="97" rx="25" ry="10" /><path className="portal-accent" d="M66 86V49l25-8v34m138 5V43l25 8v37M146 61V28l28 7v38" /><path className="portal-detail" d="m137 121 23 9 25-10" /></>}
    {room === "living" && <><path className="portal-solid" d="m82 80 67-23 50 24-65 26Zm0 0v17l52 25v-15l65-26v17l-65 25" /><path className="portal-accent" d="m82 80 67-23 50 24-65 26ZM224 96V57m-14 2 14-22 15 23Z" /><ellipse className="portal-detail" cx="186" cy="110" rx="26" ry="9" /></>}
    {room === "gaming" && <><path className="portal-solid" d="m81 88 29-10V30L81 41Zm95 9 56-21V42l-56 17Z" /><path className="portal-accent" d="M86 61V45l19-6v16Zm90 36 56-21V42l-56 17Z" /><path className="portal-detail" d="m89 71 14-5m88 3 8 2 12-15 12 2m-20 36 10 9m-67 13 28-11 26 12-29 10Z" /></>}
    <path className="portal-accent" d="m38 104 122 48 122-48" />
  </svg>;
}
