import type { Constraint, Entity, LineEntity } from './types/cad';

export type DragTarget = {
  entityId: number;
  handle: string;
  x: number;
  y: number;
};

export type SolveOptions = {
  drag?: DragTarget;
  stayWeight?: number;
  dragWeight?: number;
  constraintWeight?: number;
  maxIterations?: number;
  tolerance?: number;
};

type VarSlot = {
  entityId: number;
  field: 'x1' | 'y1' | 'x2' | 'y2';
};

type LineCoords = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

function isLine(entity: Entity): entity is LineEntity {
  return entity.type === 'line';
}

function residualNorm(residuals: number[]) {
  let sum = 0;
  for (const value of residuals) sum += value * value;
  return Math.sqrt(sum);
}

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const augmented = matrix.map((row, i) => [...row, rhs[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row;
    }
    if (Math.abs(augmented[pivot][col]) < 1e-12) return null;
    if (pivot !== col) {
      const tmp = augmented[col];
      augmented[col] = augmented[pivot];
      augmented[pivot] = tmp;
    }

    const diag = augmented[col][col];
    for (let j = col; j <= n; j += 1) augmented[col][j] /= diag;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = augmented[row][col];
      if (factor === 0) continue;
      for (let j = col; j <= n; j += 1) {
        augmented[row][j] -= factor * augmented[col][j];
      }
    }
  }

  return augmented.map((row) => row[n]);
}

/**
 * Minimal Gauss-Newton sketch solver for line-pair constraints.
 * Parallel residual: cross product of direction vectors (zero when parallel).
 * Perpendicular residual: dot product of direction vectors (zero when perpendicular).
 * Plus soft stay residuals and an optional strong drag target.
 */
export function solveConstraints(
  entities: Entity[],
  constraints: Constraint[],
  options: SolveOptions = {},
): void {
  let pairConstraints = constraints.filter(
    (constraint) => constraint.type === 'parallel' || constraint.type === 'perpendicular',
  );
  if (!pairConstraints.length) return;

  if (options.drag) {
    const dragId = options.drag.entityId;
    pairConstraints = pairConstraints.filter((constraint) =>
      constraint.refs.some((ref) => ref.entityId === dragId),
    );
    if (!pairConstraints.length) return;
  }

  const involvedIds = new Set<number>();
  for (const constraint of pairConstraints) {
    for (const ref of constraint.refs) involvedIds.add(ref.entityId);
  }

  const lines = entities.filter((entity): entity is LineEntity => isLine(entity) && involvedIds.has(entity.id));
  if (lines.length < 1) return;

  const slots: VarSlot[] = [];
  const indexOf = new Map<string, number>();
  for (const line of lines) {
    for (const field of ['x1', 'y1', 'x2', 'y2'] as const) {
      indexOf.set(`${line.id}:${field}`, slots.length);
      slots.push({ entityId: line.id, field });
    }
  }

  const lineById = new Map(lines.map((line) => [line.id, line]));
  const xPrev = slots.map((slot) => lineById.get(slot.entityId)![slot.field]);
  const x = xPrev.slice();

  const stayWeight = options.stayWeight ?? 1;
  const dragWeight = options.dragWeight ?? 100;
  // 几何约束必须远大于 stay，否则求解结果只是“接近”满足约束的折中，
  // 会留下肉眼可见的角度误差；同时又远大于 drag，保证拖动时约束依然成立。
  const constraintWeight = options.constraintWeight ?? 1e4;
  const maxIterations = options.maxIterations ?? 25;
  const tolerance = options.tolerance ?? 1e-5;

  const dragIndices = new Set<number>();
  if (options.drag) {
    const fields = options.drag.handle === 'start' ? (['x1', 'y1'] as const) : (['x2', 'y2'] as const);
    for (const field of fields) {
      const idx = indexOf.get(`${options.drag.entityId}:${field}`);
      if (idx !== undefined) dragIndices.add(idx);
    }
  }

  function coordsOf(vec: number[], entityId: number): LineCoords | null {
    const base = indexOf.get(`${entityId}:x1`);
    if (base === undefined) return null;
    return {
      x1: vec[base],
      y1: vec[base + 1],
      x2: vec[base + 2],
      y2: vec[base + 3],
    };
  }

  const constraintScale = Math.sqrt(constraintWeight);

  function computeResiduals(vec: number[]): number[] {
    const residuals: number[] = [];

    for (const constraint of pairConstraints) {
      const a = coordsOf(vec, constraint.refs[0]?.entityId);
      const b = coordsOf(vec, constraint.refs[1]?.entityId);
      if (!a || !b) continue;
      const dx1 = a.x2 - a.x1;
      const dy1 = a.y2 - a.y1;
      const dx2 = b.x2 - b.x1;
      const dy2 = b.y2 - b.y1;
      const scale = (Math.hypot(dx1, dy1) + Math.hypot(dx2, dy2)) * 0.5 || 1;
      if (constraint.type === 'perpendicular') {
        residuals.push(constraintScale * (dx1 * dx2 + dy1 * dy2) / scale);
      } else {
        residuals.push(constraintScale * (dx1 * dy2 - dy1 * dx2) / scale);
      }
    }

    const stayScale = Math.sqrt(stayWeight);
    for (let i = 0; i < vec.length; i += 1) {
      if (dragIndices.has(i)) continue;
      residuals.push(stayScale * (vec[i] - xPrev[i]));
    }

    if (options.drag && dragIndices.size === 2) {
      const fields = options.drag.handle === 'start' ? (['x1', 'y1'] as const) : (['x2', 'y2'] as const);
      const targets = [options.drag.x, options.drag.y];
      const dragScale = Math.sqrt(dragWeight);
      fields.forEach((field, offset) => {
        const idx = indexOf.get(`${options.drag!.entityId}:${field}`);
        if (idx === undefined) return;
        residuals.push(dragScale * (vec[idx] - targets[offset]));
      });
    }

    return residuals;
  }

  function jacobianNumeric(vec: number[]): { residuals: number[]; jacobian: number[][] } {
    const eps = 1e-6;
    const residuals = computeResiduals(vec);
    const m = residuals.length;
    const n = vec.length;
    const jacobian = Array.from({ length: m }, () => new Array<number>(n).fill(0));

    for (let j = 0; j < n; j += 1) {
      const saved = vec[j];
      vec[j] = saved + eps;
      const perturbed = computeResiduals(vec);
      vec[j] = saved;
      for (let i = 0; i < m; i += 1) {
        jacobian[i][j] = (perturbed[i] - residuals[i]) / eps;
      }
    }

    return { residuals, jacobian };
  }

  for (let iter = 0; iter < maxIterations; iter += 1) {
    const { residuals, jacobian } = jacobianNumeric(x);
    if (residualNorm(residuals) < tolerance) break;

    const n = x.length;
    const jtj = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const jtr = new Array<number>(n).fill(0);

    for (let i = 0; i < residuals.length; i += 1) {
      for (let j = 0; j < n; j += 1) {
        jtr[j] += jacobian[i][j] * residuals[i];
        for (let k = 0; k < n; k += 1) {
          jtj[j][k] += jacobian[i][j] * jacobian[i][k];
        }
      }
    }

    const damping = 1e-6;
    for (let j = 0; j < n; j += 1) jtj[j][j] += damping;

    const delta = solveLinearSystem(
      jtj,
      jtr.map((value) => -value),
    );
    if (!delta) break;

    for (let j = 0; j < n; j += 1) x[j] += delta[j];
  }

  for (let i = 0; i < slots.length; i += 1) {
    const line = lineById.get(slots[i].entityId);
    if (line) line[slots[i].field] = x[i];
  }
}
