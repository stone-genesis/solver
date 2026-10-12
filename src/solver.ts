import type { Constraint, ConstraintType, Entity } from './types/cad';

export type DragTarget = {
  entityId: number;
  handle: string;
  x: number;
  y: number;
};

export type SolveOptions = {
  drag?: DragTarget;
  pinEntityIds?: number[];
  stayWeight?: number;
  dragWeight?: number;
  pinWeight?: number;
  constraintWeight?: number;
  maxIterations?: number;
  tolerance?: number;
};

type VarDef = {
  key: string;
  read: () => number;
  write: (value: number) => void;
};

type VarSlot = VarDef & {
  entityId: number;
};

type LineCoords = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type PointCoords = {
  x: number;
  y: number;
};

const SOLVER_CONSTRAINT_TYPES: ReadonlySet<ConstraintType> = new Set([
  'parallel',
  'perpendicular',
  'horizontal',
  'vertical',
  'equalLength',
  'coincident',
  'angle',
  'concentric',
  'length',
  'distance',
  'radius',
]);

function isSolverConstraint(constraint: Constraint) {
  return SOLVER_CONSTRAINT_TYPES.has(constraint.type);
}

// 回答residuals这组数值距离0还有多远的距离
function residualNorm(residuals: number[]) {
  let sum = 0;
  for (const value of residuals) {
    sum += value * value;
  }
  return Math.sqrt(sum);
}

function collectSolverConstraints(constraints: Constraint[], seedId?: number): Constraint[] {
  const all = constraints.filter(isSolverConstraint);
  if (!all.length || seedId === undefined) return all;

  const involved = new Set<number>([seedId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const constraint of all) {
      const ids = constraint.refs.map((ref) => ref.entityId);
      if (!ids.some((id) => involved.has(id))) continue;
      for (const id of ids) {
        if (involved.has(id)) continue;
        involved.add(id);
        grew = true;
      }
    }
  }

  return all.filter((constraint) => constraint.refs.some((ref) => involved.has(ref.entityId)));
}

// 返回变量的写回函数
function entityVarDefs(entity: Entity): VarDef[] {
  if (entity.type === 'line') {
    return [
      { key: 'x1', read: () => entity.x1, write: (value) => { entity.x1 = value; } },
      { key: 'y1', read: () => entity.y1, write: (value) => { entity.y1 = value; } },
      { key: 'x2', read: () => entity.x2, write: (value) => { entity.x2 = value; } },
      { key: 'y2', read: () => entity.y2, write: (value) => { entity.y2 = value; } },
    ];
  }
  if (entity.type === 'circle') {
    return [
      { key: 'cx', read: () => entity.cx, write: (value) => { entity.cx = value; } },
      { key: 'cy', read: () => entity.cy, write: (value) => { entity.cy = value; } },
      { key: 'r', read: () => entity.r, write: (value) => { entity.r = value; } },
    ];
  }
  if (entity.type === 'ellipse') {
    return [
      { key: 'cx', read: () => entity.cx, write: (value) => { entity.cx = value; } },
      { key: 'cy', read: () => entity.cy, write: (value) => { entity.cy = value; } },
      { key: 'rx', read: () => entity.rx, write: (value) => { entity.rx = value; } },
      { key: 'ry', read: () => entity.ry, write: (value) => { entity.ry = value; } },
    ];
  }
  if (entity.type === 'rect') {
    return [
      { key: 'x', read: () => entity.x, write: (value) => { entity.x = value; } },
      { key: 'y', read: () => entity.y, write: (value) => { entity.y = value; } },
      { key: 'w', read: () => entity.w, write: (value) => { entity.w = value; } },
      { key: 'h', read: () => entity.h, write: (value) => { entity.h = value; } },
    ];
  }
  return entity.points.flatMap((point, index) => [
    { key: `p${index}.x`, read: () => point.x, write: (value) => { entity.points[index].x = value; } },
    { key: `p${index}.y`, read: () => point.y, write: (value) => { entity.points[index].y = value; } },
  ]);
}

function handleVarKeys(entity: Entity, handle: string): string[] {
  if (entity.type === 'line') {
    return handle === 'start' ? ['x1', 'y1'] : ['x2', 'y2'];
  }
  if (entity.type === 'circle') {
    return handle === 'center' ? ['cx', 'cy'] : ['r'];
  }
  if (entity.type === 'ellipse') {
    if (handle === 'center') return ['cx', 'cy'];
    const keys: string[] = [];
    if (handle.includes('e') || handle.includes('w')) keys.push('rx');
    if (handle.includes('n') || handle.includes('s')) keys.push('ry');
    return keys;
  }
  if (entity.type === 'rect') {
    const keys: string[] = [];
    if (handle.includes('w') || handle.includes('e')) keys.push('x', 'w');
    if (handle.includes('n') || handle.includes('s')) keys.push('y', 'h');
    return keys;
  }
  if (handle.startsWith('p')) return [`${handle}.x`, `${handle}.y`];
  return [];
}

function rectCorner(x: number, y: number, w: number, h: number, handle: string): PointCoords | null {
  const minX = Math.min(x, x + w);
  const minY = Math.min(y, y + h);
  const maxX = Math.max(x, x + w);
  const maxY = Math.max(y, y + h);
  if (handle === 'nw') return { x: minX, y: minY };
  if (handle === 'ne') return { x: maxX, y: minY };
  if (handle === 'se') return { x: maxX, y: maxY };
  if (handle === 'sw') return { x: minX, y: maxY };
  return null;
}

// 高斯-约当消元法（Gauss-Jordan elimination）的实现，用来求解线性方程组 Ax = b
// matrix: A
// rhs: b
// 返回结果是x
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
    for (let j = col; j <= n; j += 1) 
        augmented[col][j] /= diag;

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

function lineResiduals(constraint: Constraint, a: LineCoords, b: LineCoords | null, scale: number): number[] {
  if (constraint.type === 'horizontal') return [scale * (a.y2 - a.y1)];
  if (constraint.type === 'vertical') return [scale * (a.x2 - a.x1)];
  // 定长：当前长度与目标值之差
  if (constraint.type === 'length') {
    if (!Number.isFinite(constraint.value)) return [];
    return [scale * (Math.hypot(a.x2 - a.x1, a.y2 - a.y1) - (constraint.value as number))];
  }
  if (!b) return [];

  const dx1 = a.x2 - a.x1;
  const dy1 = a.y2 - a.y1;
  const dx2 = b.x2 - b.x1;
  const dy2 = b.y2 - b.y1;
  // DirA = (dx1,dy1)  DirB = (dx2,dy2)
  // dot(DirA,DirB) = dx1 * dx2 + dy1 * dy2

  if (constraint.type === 'equalLength') {
    return [scale * (Math.hypot(dx1, dy1) - Math.hypot(dx2, dy2))];
  }

  const lengthScale = (Math.hypot(dx1, dy1) + Math.hypot(dx2, dy2)) * 0.5 || 1;
  const cross = dx1 * dy2 - dy1 * dx2; //叉乘
  const dot = dx1 * dx2 + dy1 * dy2; // 数量积

  // 角度约束
  if (constraint.type === 'angle') {
    if (!Number.isFinite(constraint.value)) return [];
    const target = (constraint.value as number) * Math.PI / 180;
    return [scale * (cross * Math.cos(target) - dot * Math.sin(target)) / lengthScale];
  }
  // 点乘为0 
  if (constraint.type === 'perpendicular') {
    return [scale * (dot) / lengthScale];
  }
  // 叉乘为0
  if (constraint.type === 'parallel') {
    return [scale * (cross) / lengthScale];
  }
  return [];
}

/**
 * 计算 Jᵀ × J（对称矩阵）
 * @param J  m×n 矩阵（二维数组，m行n列）
 * @returns  n×n 对称矩阵
 */
function matMulJtJ(J: number[][]): number[][] {
  const m = J.length;
  const n = J[0].length;
  const result: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < m; i++) {
    const row = J[i];
    for (let j = 0; j < n; j++) {
      const Jij = row[j];
      if (Jij === 0) continue; // 稀疏优化
      for (let k = j; k < n; k++) { // 只算上三角
        result[j][k] += Jij * row[k];
      }
    }
  }
  // 镜像到下三角
  for (let j = 0; j < n; j++) {
    for (let k = 0; k < j; k++) {
      result[j][k] = result[k][j];
    }
  }
  return result;
}

/**
 * 计算 Jᵀ × r
 * @param J  m×n 矩阵
 * @param r  m维向量
 * @returns  n维向量
 */
function matMulJtr(J: number[][], r: number[]): number[] {
  const m = J.length;
  const n = J[0].length;
  const result = new Array(n).fill(0);

  for (let i = 0; i < m; i++) {
    const ri = r[i];
    if (ri === 0) continue;
    const row = J[i];
    for (let j = 0; j < n; j++) {
      result[j] += row[j] * ri;
    }
  }
  return result;
}

/**
 * Gauss-Newton sketch solver.
 * Line constraints: parallel, perpendicular, horizontal, vertical, equal length, angle.
 * Coincident: two handles share the same (x, y).
 */
export function solveConstraints( entities: Entity[], constraints: Constraint[], options: SolveOptions = {},): void {
  const activeConstraints = collectSolverConstraints(constraints, options.drag?.entityId);
  if (!activeConstraints.length) return;

  // 涉及的id
  const involvedIds = new Set<number>();
  for (const constraint of activeConstraints) {
    for (const ref of constraint.refs) 
        involvedIds.add(ref.entityId);
  }
  // involved entities
  const involvedEntityList = entities.filter((entity) => involvedIds.has(entity.id));
  // {entityId: entity} map
  const entityById = new Map(involvedEntityList.map((entity) => [entity.id, entity]));

  // slots形如:
  // {entityId: 4, key: 'x1', read: ƒ, write: ƒ}
  // {entityId: 1, key: 'y1', read: ƒ, write: ƒ}
  const slots: VarSlot[] = []; //给每个对象的每个变量 (比如x1,y1提供一个VarSlot)
  const indexOf = new Map<string, number>(); // 形如: ["4:y1", 5]
  for (const entity of involvedEntityList) {
    for (const def of entityVarDefs(entity)) {
      indexOf.set(`${entity.id}:${def.key}`, slots.length);//slots.length是不断增加的
      slots.push({ entityId: entity.id, ...def });
    }
  }

  if (!slots.length) return;

  // 调用slots里面每个slot的read方法读取原本的数值
  // x是所有图形所有可以操作的属性的值（按照图形排列，先图形1的所有属性，然后图形2的所有属性...)
  const xPrev = slots.map((slot) => slot.read());
  const x = xPrev.slice();//浅拷贝整个数组

  const stayWeight = options.stayWeight ?? 1;
  const dragWeight = options.dragWeight ?? 100;
  const pinWeight = options.pinWeight ?? 100;
  // 几何约束必须远大于 stay，否则求解结果只是“接近”满足约束的折中，
  // 会留下肉眼可见的角度误差；同时又远大于 drag，保证拖动时约束依然成立。
  const constraintWeight = options.constraintWeight ?? 1e4;
  const maxIterations = options.maxIterations ?? 25;
  const tolerance = options.tolerance ?? 1e-5;
  const constraintScale = Math.sqrt(constraintWeight);//100

  // skipStay 是一个"豁免名单"，记录哪些变量不需要加"stay(保持原位)残差"
  const skipStay = new Set<number>();
  if (options.drag) {
    const entity = entityById.get(options.drag.entityId);
    if (entity) {
      for (const key of handleVarKeys(entity, options.drag.handle)) {
        const idx = indexOf.get(`${entity.id}:${key}`);
        if (idx !== undefined) skipStay.add(idx);
      }
    }
  }
  for (const entityId of options.pinEntityIds ?? []) {
    for (const slot of slots) {
      if (slot.entityId !== entityId) continue;
      skipStay.add(indexOf.get(`${entityId}:${slot.key}`)!);
    }
  }

  // 求解过程
  for (let iter = 0; iter < maxIterations; iter += 1) {
    // x是n*1, n代表变量的个数
    // residuals是m*1,m代表方程数/残差数
    const { residuals, jacobian, constraintCount } = jacobianNumeric(x);//计算残差r和jacobian矩阵
    if (residualNorm(residuals.slice(0, constraintCount)) < tolerance) {
      break;
    }

    const n = x.length;
    // J矩阵： m*n   JtJ: n*n  jtr: n*1
    // JᵀJ：Jacobian（雅可比矩阵）的转置乘自身
    // Jᵀr：Jacobian 的转置乘残差向量
    let jtj = Array.from({ length: n }, () => new Array<number>(n).fill(0));//n*n
    let jtr = new Array<number>(n).fill(0);
       
    // 计算JᵀJ和Jᵀr
    jtj = matMulJtJ(jacobian);
    jtr = matMulJtr(jacobian, residuals);

    // JᵀJ + λI
    const damping = 1e-6; //阻尼
    for (let j = 0; j < n; j += 1) {
      jtj[j][j] += damping;
    }

    // 正规方程求解（高斯消元） 求解deltaX
    const deltaX = solveLinearSystem(
      jtj,
      jtr.map((value) => -value),
    );
    if (!deltaX) break;

    // delta 就是本轮应给各个图形参数加上的修正量
    for (let j = 0; j < n; j += 1)
        x[j] += deltaX[j];
  }  

  // 写回(end)
  for (let i = 0; i < slots.length; i += 1) slots[i].write(x[i]);


  // 下面是内部定义的一些函数
  function valueOf(vec: number[], entityId: number, key: string): number | null {
    const idx = indexOf.get(`${entityId}:${key}`);
    return idx === undefined ? null : vec[idx];
  }

  function centerOf(vec: number[], entityId: number): PointCoords | null {
    const cx = valueOf(vec, entityId, 'cx');
    const cy = valueOf(vec, entityId, 'cy');
    return cx === null || cy === null ? null : { x: cx, y: cy };
  }

  function coordsOf(vec: number[], entityId: number): LineCoords | null {
    const x1 = valueOf(vec, entityId, 'x1'); // (vec, id, key)
    const y1 = valueOf(vec, entityId, 'y1');
    const x2 = valueOf(vec, entityId, 'x2');
    const y2 = valueOf(vec, entityId, 'y2');
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
    return { x1, y1, x2, y2 };
  }

  function pointOf(vec: number[], entityId: number, handle?: string): PointCoords | null {
    const entity = entityById.get(entityId);
    if (!entity || !handle) return null;

    if (entity.type === 'line') {
      if (handle === 'start') {
        const px = valueOf(vec, entityId, 'x1');
        const py = valueOf(vec, entityId, 'y1');
        return px === null || py === null ? null : { x: px, y: py };
      }
      const px = valueOf(vec, entityId, 'x2');
      const py = valueOf(vec, entityId, 'y2');
      return px === null || py === null ? null : { x: px, y: py };
    }

    if (entity.type === 'circle' || entity.type === 'ellipse') {
      const cx = valueOf(vec, entityId, 'cx');
      const cy = valueOf(vec, entityId, 'cy');
      if (cx === null || cy === null) return null;
      if (handle === 'center') return { x: cx, y: cy };
      if (entity.type === 'circle') {
        const r = valueOf(vec, entityId, 'r') ?? entity.r;
        if (handle === 'radius-e') return { x: cx + r, y: cy };
        if (handle === 'radius-n') return { x: cx, y: cy - r };
        if (handle === 'radius-w') return { x: cx - r, y: cy };
        if (handle === 'radius-s') return { x: cx, y: cy + r };
      }
      return null;
    }

    if (entity.type === 'rect') {
      const px = valueOf(vec, entityId, 'x');
      const py = valueOf(vec, entityId, 'y');
      const w = valueOf(vec, entityId, 'w');
      const h = valueOf(vec, entityId, 'h');
      if (px === null || py === null || w === null || h === null) return null;
      return rectCorner(px, py, w, h, handle);
    }

    if (!handle.startsWith('p')) return null;
    const px = valueOf(vec, entityId, `${handle}.x`);
    const py = valueOf(vec, entityId, `${handle}.y`);
    return px === null || py === null ? null : { x: px, y: py };
  }

  /*
    水平：100 * (y2 - y1) —— y 不等，就有一个数
    重合：100*(ax-bx), 100*(ay-by) —— 两点拆成两个数
    平行 / 垂直 / 等长 / 夹角：各 1 个数
    
    本质：r=f(x) 
    computeResiduals(vec)：
      就是把 n 维变量向量 x 代入一组几何公式和软约束公式，逐条算出 m 个标量结果，
      然后拼成一个 m×1 的向量
   */
  function constraintResiduals(constraint: Constraint, vec: number[]): number[] {
    if (constraint.type === 'coincident') {
      const a = pointOf(vec, constraint.refs[0]?.entityId, constraint.refs[0]?.handle);
      const b = pointOf(vec, constraint.refs[1]?.entityId, constraint.refs[1]?.handle);
      if (!a || !b) return [];
      //贡献2个残差，就是当前差多少的含义！！
      return [constraintScale * (a.x - b.x), constraintScale * (a.y - b.y)];
    }

    // 同心：两个圆/椭圆的圆心重合，拆成 x、y 两条残差
    if (constraint.type === 'concentric') {
      const a = centerOf(vec, constraint.refs[0]?.entityId);
      const b = centerOf(vec, constraint.refs[1]?.entityId);
      if (!a || !b) return [];
      //贡献两个残差
      return [constraintScale * (a.x - b.x), constraintScale * (a.y - b.y)];
    }

    // 定半径：圆的 r 与目标值之差
    if (constraint.type === 'radius') {
      if (!Number.isFinite(constraint.value)) return [];
      const r = valueOf(vec, constraint.refs[0]?.entityId, 'r');
      if (r === null) return [];
      return [constraintScale * (r - (constraint.value as number))];
    }

    // 定距：两点当前距离与目标值之差
    if (constraint.type === 'distance') {
      if (!Number.isFinite(constraint.value)) return [];
      const a = pointOf(vec, constraint.refs[0]?.entityId, constraint.refs[0]?.handle);
      const b = pointOf(vec, constraint.refs[1]?.entityId, constraint.refs[1]?.handle);
      if (!a || !b) return [];
      return [constraintScale * (Math.hypot(a.x - b.x, a.y - b.y) - (constraint.value as number))];
    }

    const a = coordsOf(vec, constraint.refs[0]?.entityId);
    if (!a) return [];
    const b = constraint.refs[1] ? coordsOf(vec, constraint.refs[1].entityId) : null;
    return lineResiduals(constraint, a, b, constraintScale);
  }

  // ① 几何约束
  // ② stay
  // ③ drag
  // ④ pin
  function computeResiduals(vec: number[]): { residuals: number[]; constraintCount: number } {
    const residuals: number[] = [];

    for (const constraint of activeConstraints) {
      residuals.push(...constraintResiduals(constraint, vec));
    }
    const constraintCount = residuals.length;

    //  stay(没被拖、没被钉的变量，尽量别动)
    // 残差 = 1 * (vec[i] - xPrev[i])
    const stayScale = Math.sqrt(stayWeight);
    for (let i = 0; i < vec.length; i += 1) {
      if (skipStay.has(i)) continue;
      residuals.push(stayScale * (vec[i] - xPrev[i]));
    }

    // drag(手柄去追鼠标)
    // 残差 = [10*(手柄x - 鼠标x), 10*(手柄y - 鼠标y)]
    if (options.drag) {
      const p = pointOf(vec, options.drag.entityId, options.drag.handle);
      if (p) {
        const dragScale = Math.sqrt(dragWeight);
        residuals.push(dragScale * (p.x - options.drag.x), dragScale * (p.y - options.drag.y));
      }
    }

    // pin（某些图形钉死）
    // 残差 = 10 * (现在的值 - 旧值)
    if (options.pinEntityIds?.length) {
      const pinScale = Math.sqrt(pinWeight);
      for (const entityId of options.pinEntityIds) {
        for (const slot of slots) {
          if (slot.entityId !== entityId) {
            continue;
          }
          const idx = indexOf.get(`${entityId}:${slot.key}`);
          if (idx === undefined) continue;
          residuals.push(pinScale * (vec[idx] - xPrev[idx]));
        }
      }
    }

    return { residuals, constraintCount };
  }

  /*
    变量 x[j] 加一个很小的 eps
      → 重新得到 perturbed residuals
      → 对每一行 i：
        J[i][j] = (perturbed[i] - residuals[i]) / eps
    vec: 当前这一轮迭代中，求解器暂时假设的“所有参与图形的坐标”
         例如：
          vec = [
            A.x1, A.y1, A.x2, A.y2,
            B.x1, B.y1, B.x2, B.y2
          ]
    vec.length相当于变量的数量(n)
   */
  function jacobianNumeric(vec: number[]): { residuals: number[]; jacobian: number[][]; constraintCount: number; } {
    const eps = 1e-6;
    //  residuals[i]: 第 i 条误差方程当前的值
    const { residuals, constraintCount } = computeResiduals(vec);//计算r(x): m*1大小
    const m = residuals.length; // 残差数量（矩阵行数）
    const n = vec.length;       //变量数量（矩阵列数）

    // 创建一个m * n维度的jacobian矩阵
    const jacobian = Array.from({ length: m }, () => new Array<number>(n).fill(0));

    /*
        对每个变量 j：vec[j] += eps，再算一遍残差
        J[i][j] = (新残差[i] - 旧残差[i]) / eps
        J[i][j] = (r(x + εej) - r(x)) / ε 把某个坐标临时加 1e-6，重新算一遍残差，看变化量
        J[i][j]          = x[j] 微调时，residuals[i] 的变化速度
         
        ε * e_j 是一个“只在第 j 个位置有值、其余全为零”的稀疏向量
     */
    // 对每一个变量 vec[j] 进行扰动 （n个变量),然后更新的是 Jacobian 矩阵的第 j 列
    for (let j = 0; j < n; j += 1) {
      const saved = vec[j];
      vec[j] = saved + eps; //添加微小扰动
      const perturbed = computeResiduals(vec).residuals;
      vec[j] = saved; //恢复vec[j]的值

      // 它更新的是 Jacobian 矩阵的第 j 列
      // --- 计算扰动后的残差 r(x + εeⱼ) ---
      for (let i = 0; i < residuals.length; i += 1) {
        //perturbed和residuals同维度大小
        jacobian[i][j] = (perturbed[i] - residuals[i]) / eps;
      }
    }
    return { residuals, jacobian, constraintCount };
  }
}
