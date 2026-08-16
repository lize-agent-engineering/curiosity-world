import type {
  CuriosityExperienceAggregate,
  CuriosityVersionRecord,
} from './repository';

export function selectRegenerationBase(
  aggregate: CuriosityExperienceAggregate,
  selectedVersionId?: string | null,
): CuriosityVersionRecord | undefined {
  return (
    aggregate.versions.find(
      (version) => version.id === aggregate.experience.activeVersionId,
    ) ??
    aggregate.versions.find((version) => version.id === selectedVersionId) ??
    aggregate.versions.at(-1)
  );
}

export function describeExperienceFailure(message: string | null): string | null {
  if (!message) return null;
  if (/RUNTIME_FAILED|尚未实现.+React 场景/i.test(message)) {
    return '这版探索没有通过运行检查。旧版本已保留，请重新生成。';
  }
  if (/VERSION_NOT_ACTIVE/i.test(message)) {
    return '当前版本还不能修改，请先重新生成一版可运行的探索。';
  }
  return message;
}
