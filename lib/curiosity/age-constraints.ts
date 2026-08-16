export function isPrimaryInstructionAllowed(age: number, text: string): boolean {
  const count = [...text.replace(/[\s，。！？、,.!?]/g, '')].length;
  return count <= (age <= 7 ? 16 : 28);
}

export function assertPrimaryInstructionsAllowed(age: number, instructions: string[]): void {
  const invalid = instructions.find(
    (instruction) => !isPrimaryInstructionAllowed(age, instruction),
  );
  if (invalid) {
    throw new Error(`AGE_COPY_VIOLATION: ${age} 岁主要指令过长：${invalid}`);
  }
}
