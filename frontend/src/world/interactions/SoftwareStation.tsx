import type { RepositorySummary } from "@aura/contracts";
import type { ZoneId } from "@aura/contracts";
import { dateLabel } from "../../github/model.ts";

/** Everything the Software station shows comes from the shared GitHub workspace; nothing here is generated. */
export type SoftwareStationData = {
  repos: readonly RepositorySummary[];
  selected: string;
  branch: string;
  state: string;
  mock: boolean;
  select: (fullName: string) => void;
};
export const recentRepositories = (repos: readonly RepositorySummary[], limit = 5): RepositorySummary[] =>
  [...repos].filter(r => !r.isArchived).sort((a, b) => Date.parse(b.pushedAt ?? "") - Date.parse(a.pushedAt ?? "") || a.name.localeCompare(b.name)).slice(0, limit);

export function SoftwareStation({ data, openTool }: { data: SoftwareStationData; openTool: (zone: ZoneId) => void }) {
  const recent = recentRepositories(data.repos);
  const project = data.repos.find(r => r.fullName === data.selected);
  const connected = data.state === "connected";
  return <section className="station-software" aria-label="Software development station">
    {data.mock && <p className="station-note" role="note">Browser mock data. These are not your repositories.</p>}
    {project ? <dl className="station-facts">
      <div><dt>Active project</dt><dd>{project.name}</dd></div>
      <div><dt>Branch</dt><dd>{data.branch || project.defaultBranch}</dd></div>
      <div><dt>Language</dt><dd>{project.primaryLanguage ?? "Not reported"}</dd></div>
      <div><dt>Last push</dt><dd>{dateLabel(project.pushedAt)}</dd></div>
    </dl> : <p>{connected ? "No project is selected. Choose a repository below to give the room, the displays and Astra the same context." : "GitHub is not connected. Open Projects to connect read-only access; nothing is fetched until you do."}</p>}
    {recent.length > 0 && <>
      <h3>Recently active</h3>
      <ul className="station-repos" aria-label="Recently pushed repositories">
        {recent.map(repo => <li key={repo.fullName}>
          <button aria-pressed={repo.fullName === data.selected} onClick={() => data.select(repo.fullName)}>
            <span>{repo.name}</span><small>{repo.primaryLanguage ?? "—"} · {dateLabel(repo.pushedAt)}</small>
          </button>
        </li>)}
      </ul>
    </>}
    <p className="station-foot">{data.repos.length} {data.repos.length === 1 ? "repository" : "repositories"} loaded{connected ? " · read-only GitHub access" : ""}. Selecting a project here updates the Projects and AI Lab displays.</p>
    <div className="equipment-actions"><button className="primary" disabled={!project} onClick={() => openTool("software")}>Open project workspace</button><button onClick={() => openTool("github")}>All projects</button></div>
  </section>;
}
