export type ControlledSceneDescriptor = {
  sceneType: 'variable-explorer' | 'relation-explorer';
  variables: Array<{
    id: string;
    label: string;
    min: number;
    max: number;
    initial: number;
  }>;
  relations: Array<{
    id: string;
    fromVariableId: string;
    toVariableId: string;
    direction: 'same' | 'inverse';
  }>;
};

export interface ControlledSceneState {
  descriptor: ControlledSceneDescriptor;
  values: Record<string, number>;
  comparedRelationIds: string[];
}

export type ControlledSceneAction =
  | { type: 'set-variable'; variableId: string; value: number }
  | { type: 'compare-relation'; relationId: string };

export interface ControlledSceneEvent {
  type:
    | 'experiment_started'
    | 'prediction_submitted'
    | 'variable_changed'
    | 'challenge_attempted'
    | 'challenge_completed'
    | 'explanation_selected'
    | 'experience_completed';
  taskId: string;
  action: string;
  payload: Record<string, unknown>;
}

export function createControlledSceneState(
  descriptor: ControlledSceneDescriptor,
): ControlledSceneState {
  if (descriptor.variables.length === 0) throw new Error('CONTROLLED_SCENE_VARIABLES_REQUIRED');
  return {
    descriptor: structuredClone(descriptor),
    values: Object.fromEntries(
      descriptor.variables.map((variable) => [
        variable.id,
        Math.min(variable.max, Math.max(variable.min, variable.initial)),
      ]),
    ),
    comparedRelationIds: [],
  };
}

export function reduceControlledScene(
  state: ControlledSceneState,
  action: ControlledSceneAction,
): ControlledSceneState {
  if (action.type === 'set-variable') {
    const variable = state.descriptor.variables.find(
      (candidate) => candidate.id === action.variableId,
    );
    if (!variable) throw new Error(`CONTROLLED_SCENE_VARIABLE_NOT_FOUND: ${action.variableId}`);
    return {
      ...state,
      values: {
        ...state.values,
        [variable.id]: Math.min(variable.max, Math.max(variable.min, action.value)),
      },
    };
  }

  const relation = state.descriptor.relations.find(
    (candidate) => candidate.id === action.relationId,
  );
  if (!relation) throw new Error(`CONTROLLED_SCENE_RELATION_NOT_FOUND: ${action.relationId}`);
  return {
    ...state,
    comparedRelationIds: [...new Set([...state.comparedRelationIds, relation.id])],
  };
}

export function eventForControlledSceneAction(
  previous: ControlledSceneState,
  next: ControlledSceneState,
  action: ControlledSceneAction,
): ControlledSceneEvent {
  if (action.type === 'set-variable') {
    return {
      type: 'variable_changed',
      taskId: 'exploration',
      action: `set-${action.variableId}`,
      payload: { variableId: action.variableId, value: next.values[action.variableId] },
    };
  }

  const relation = previous.descriptor.relations.find(
    (candidate) => candidate.id === action.relationId,
  );
  if (!relation) throw new Error(`CONTROLLED_SCENE_RELATION_NOT_FOUND: ${action.relationId}`);
  return {
    type: 'challenge_attempted',
    taskId: 'challenge',
    action: `compare-${relation.id}`,
    payload: { relationId: relation.id, direction: relation.direction },
  };
}
