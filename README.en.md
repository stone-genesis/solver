# Constraint Solver

A web-based CAD constraint solver application.

## Project Overview

Constraint Solver is an interactive CAD constraint solver web application that supports the creation, editing, and solving of geometric constraints. The project includes the following main features:

- **Entity Management**: Supports creation and selection of various geometric entities (points, lines, circles, etc.)
- **Constraint System**: Provides various geometric constraint tools (distance constraint, angle constraint, perpendicular constraint, parallel constraint, etc.)
- **Layer Management**: Supports layer management and display control
- **History**: Supports undo/redo operations
- **Real-time Solving**: Constraints are solved in real-time to update graphics

## Project Structure

```
├── index.html                    # Application entry point
├── bezier-curve-learning.html    # Bezier curve learning tool
├── bezier-surface-threejs.html   # Bezier surface learning tool (based on Three.js)
├── dist/                         # Built application files
│   ├── index.html
│   └── assets/
│       ├── index-*.css          # Style files
│       └── index-*.js           # JavaScript bundle
├── cmd.txt                       # Configuration file
└── launch.json                   # VS Code debug configuration
```

## Features

### Constraint Tools
- Distance constraint
- Angle constraint
- Perpendicular constraint
- Parallel constraint
- Tangent constraint
- Concentric constraint

### Operations
- Entity selection and editing
- Layer show/hide
- Undo/Redo
- Real-time constraint solving

## Quick Start

### Development Environment

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build production version
npm run build
```

### Running the Application

1. Development mode:
   ```bash
   npm run dev
   ```
   Then open the displayed address in the browser (usually http://localhost:5173)

2. Production mode:
   ```bash
   npm run build
   ```
   Then run the `dist` directory using any HTTP server

## Learning Tools

The project includes two independent learning demo pages:

- **bezier-curve-learning.html**: Interactive Bezier curve learning tool
- **bezier-surface-threejs.html**: Bezier surface visualization tool based on Three.js

You can open these HTML files directly in the browser for learning.

## Tech Stack

- **Frontend Framework**: Vue 3
- **Build Tool**: Vite
- **3D Rendering**: Three.js (for surface demos)
- **Language**: TypeScript

## License

MIT License