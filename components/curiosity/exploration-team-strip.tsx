'use client';

import { motion } from 'motion/react';

import type { TeamAssemblyArtifactV1 } from '@/lib/curiosity/agent-contracts';

export function ExplorationTeamStrip({ team }: { team: TeamAssemblyArtifactV1 }) {
  return (
    <section aria-label="本次探索小队" className="border-b border-white/10 bg-[#102d4b] px-5 py-4 sm:px-8">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="shrink-0">
          <p className="text-[10px] font-black tracking-[.16em] text-[#ffe08a]">本次专属探索小队</p>
          <p className="mt-1 text-sm font-black text-white">{team.teamName}</p>
        </div>
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:justify-end">
          {team.members.map((member, index) => (
            <motion.li
              key={member.id}
              className="group relative flex min-w-44 items-center gap-2.5 rounded-xl border bg-white/5 px-3 py-2.5"
              style={{ borderColor: `${member.color}66` }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.1 }}
              title={member.persona}
            >
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full text-lg"
                style={{ backgroundColor: `${member.color}22` }}
                aria-hidden="true"
              >
                {member.avatar}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-black text-white">{member.name}</span>
                <span className="mt-0.5 block truncate text-[10px] text-[#bcd1e2]">
                  {member.persona}
                </span>
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
