'use client';

import type { StudioProjectSummary } from '@/lib/studio/client';

/**
 * The questions a family has already asked, drawn as a sky.
 *
 * This is the product's memory made visible: one star per exploration, brighter
 * the more it was reworked, joined in the order they were asked. It is the first
 * step of the curiosity map the product is meant to grow into — a child's
 * questions are a path, not a list of files — and it is the reason this page is
 * worth returning to on a second night.
 *
 * Positions are derived from the project id, so a star keeps its place in the
 * sky across visits rather than jumping every render.
 */

const MAX_STARS = 8;

/** What the question produced: the app's name, who it was for, how many rounds. */
function metaOf(project: StudioProjectSummary): string {
  if (project.revision === 0) return '未完成';
  const who = project.mode === 'education' ? `${project.targetAge ?? '—'} 岁` : '通用';
  return [project.appName, who, `第 ${project.revision} 版`].filter(Boolean).join(' · ');
}

/** What was asked. Falls back to the project name for records made before it was kept. */
function questionOf(project: StudioProjectSummary, limit?: number): string {
  const asked = (project.question ?? project.title).trim();
  return limit && asked.length > limit ? `${asked.slice(0, limit)}…` : asked;
}

function hash(value: string): number {
  let out = 0;
  for (let index = 0; index < value.length; index += 1) {
    out = (out * 31 + value.charCodeAt(index)) >>> 0;
  }
  return out;
}

interface Placed {
  project: StudioProjectSummary;
  x: number;
  y: number;
  r: number;
}

/**
 * The sky is drawn in a 960-wide coordinate space so one unit is about one
 * pixel at full width — type set here reads at the size it says it is, and
 * scales down with the viewport instead of ballooning.
 */
export const SKY_WIDTH = 960;
const COLUMN_COUNT = 3;
const ROW_HEIGHT = 132;

/** Lay stars out in bands so labels never collide, jittered from the id. */
export function placeStudioStars(projects: StudioProjectSummary[]): Placed[] {
  const shown = projects.slice(0, MAX_STARS);
  const columns = shown.length <= 4 ? 2 : COLUMN_COUNT;
  const cellWidth = SKY_WIDTH / columns;
  return shown.map((project, index) => {
    const seed = hash(project.id);
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      project,
      x: column * cellWidth + 18 + ((seed >> 3) % 26),
      y: row * ROW_HEIGHT + 34 + ((seed >> 7) % 22),
      // More rounds of work on a question makes a brighter star.
      r: 3.5 + Math.min(3, project.revision) * 1.6,
    };
  });
}

interface StudioSkyChartProps {
  projects: StudioProjectSummary[];
  onOpenProject: (projectId: string) => void;
}

export function StudioSkyChart({ projects, onOpenProject }: StudioSkyChartProps) {
  const stars = placeStudioStars(projects);
  const rows = Math.ceil(stars.length / (stars.length <= 4 ? 2 : COLUMN_COUNT));

  return (
    <div>
      {/* Wide screens get the sky. */}
      <svg
        viewBox={`0 0 ${SKY_WIDTH} ${rows * ROW_HEIGHT + 26}`}
        className="hidden w-full sm:block"
        role="list"
        aria-label="问过的问题"
      >
        {stars.slice(1).map((star, index) => {
          const previous = stars[index]!;
          return (
            <line
              key={`link-${star.project.id}`}
              x1={previous.x}
              y1={previous.y}
              x2={star.x}
              y2={star.y}
              stroke="var(--night-rule)"
              strokeWidth={1}
              strokeDasharray="5 6"
            />
          );
        })}
        {stars.map((star) => (
          <g
            key={star.project.id}
            role="listitem"
            tabIndex={0}
            aria-label={`${star.project.question ?? star.project.title}，${
              star.project.revision === 0 ? '未完成' : `第 ${star.project.revision} 版`
            }`}
            className="cursor-pointer outline-none [&:focus-visible_.sky-halo]:opacity-40 [&:hover_.sky-label]:fill-[var(--star)] [&:hover_.sky-star]:opacity-100"
            onClick={() => onOpenProject(star.project.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenProject(star.project.id);
              }
            }}
          >
            <circle
              className="sky-star"
              cx={star.x}
              cy={star.y}
              r={star.r}
              fill="var(--moon)"
              opacity={star.project.revision === 0 ? 0.3 : 0.85}
            />
            <circle
              className="sky-halo"
              cx={star.x}
              cy={star.y}
              r={star.r * 3.2}
              fill="var(--moon)"
              opacity={star.project.revision === 0 ? 0.03 : 0.08}
            />
            <text
              className="sky-label"
              x={star.x + star.r + 12}
              y={star.y + 1}
              fill="var(--star-soft)"
              style={{ font: '600 14px var(--font-sans)' }}
            >
              {questionOf(star.project, 17)}
            </text>
            <text
              x={star.x + star.r + 12}
              y={star.y + 18}
              fill="var(--star-faint)"
              style={{ font: '10px var(--font-geist-mono)', letterSpacing: '0.08em' }}
            >
              {metaOf(star.project)}
            </text>
          </g>
        ))}
      </svg>

      {/* The same content as a list where a sky would not be readable. */}
      <ul className="space-y-1.5 sm:hidden">
        {stars.map((star) => (
          <li key={star.project.id}>
            <button
              type="button"
              onClick={() => onOpenProject(star.project.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-night-rule bg-night-raised px-3 py-3 text-left transition hover:border-moon/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moon"
            >
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full bg-moon"
                style={{ opacity: 0.5 + Math.min(3, star.project.revision) * 0.16 }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-star">
                  {questionOf(star.project)}
                </span>
                <span className="mt-1 block truncate text-[11px] text-star-faint">
                  {metaOf(star.project)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
