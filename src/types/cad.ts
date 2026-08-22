export type Point = {
  x: number;
  y: number;
};

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type ToolId =
  | 'select'
  | 'lasso'
  | 'line'
  | 'circle'
  | 'ellipse'
  | 'rect'
  | 'arc'
  | 'triangle'
  | 'polyline';

export type DrawingToolId = Exclude<ToolId, 'select' | 'lasso'>;

export type ConstraintType =
  | 'coincident'
  | 'horizontal'
  | 'vertical'
  | 'fixed'
  | 'parallel'
  | 'perpendicular'
  | 'equalLength'
  | 'angle';

export type ConstraintTarget = 'line' | 'line-pair' | 'point' | 'point-pair';

export type PanelMode = 'properties' | 'constraints';

export type Layer = {
  id: number;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
};

export type EntityBase = {
  id: number;
  layerId: number;
};

export type LineEntity = EntityBase & {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type CircleEntity = EntityBase & {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
};

export type EllipseEntity = EntityBase & {
  type: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

export type RectEntity = EntityBase & {
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ArcEntity = EntityBase & {
  type: 'arc';
  points: Point[];
};

export type TriangleEntity = EntityBase & {
  type: 'triangle';
  points: Point[];
};

export type PolylineEntity = EntityBase & {
  type: 'polyline';
  points: Point[];
};

export type Entity =
  | LineEntity
  | CircleEntity
  | EllipseEntity
  | RectEntity
  | ArcEntity
  | TriangleEntity
  | PolylineEntity;

export type EntityType = Entity['type'];

export type ConstraintRef = {
  entityId: number;
  handle?: string;
  x?: number; //fixed约束用
  y?: number;
};

export type Constraint = {
  id: number;
  type: ConstraintType;
  refs: ConstraintRef[];
  value?: number;
};

export type ToolDef = {
  id: ToolId;
  label: string;
  icon: string;
  title: string;
};

export type ConstraintToolDef = {
  id: ConstraintType;
  label: string;
  icon: string;
  title: string;
  target: ConstraintTarget;
};

// 手柄，就是选中图形后可以拖拽的点
export type Handle = {
  key: string;
  x: number;
  y: number;
};

export type Draft =
  | {
      tool: 'line' | 'circle' | 'ellipse' | 'rect';
      start: Point;
      current: Point;
      points?: undefined;
    }
  | {
      tool: 'arc' | 'triangle' | 'polyline';
      points: Point[];
      current: Point;
      start?: undefined;
    };

export type DragState = {
  start: Point;
  originals: Entity[];
  ids?: number[];
  historyRecorded?: boolean;
};

export type HandleDragState = {
  entityId: number;
  handle: string; // start,end等
  original: Entity;
  historyRecorded?: boolean;
};

export type LassoState = {
  points: Point[];
};

export type HistorySnapshot = {
  entities: Entity[];
  constraints: Constraint[];
  layers: Layer[];
  currentLayerId: number;
  selectedIds: number[];
  nextId: number;
  nextLayerId: number;
  nextConstraintId: number;
};

export type PendingConstraint = {
  entityId: number | '';
  entityIdB: number | '';
  refA: string;
  refB: string;
  angle: number | '';
};

export type RefOption = {
  value: string | number;
  label: string;
};

export type OrientationActive = {
  entityId?: number;
  handle?: string | null;
};
