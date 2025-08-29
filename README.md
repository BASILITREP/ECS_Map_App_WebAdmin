# ECS Field Engineer Mapping Application

This application helps manage field engineers and service requests for branches.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file with the following content:

```
MAP_BOX_TOKEN=your_mapbox_token
VITE_API_URL=https://localhost:7126/api
```

## Running the Application

### Start the Backend (.NET Core API)

1. Open a terminal and navigate to the API folder:

```bash
cd ../EcsFeMappingApi
```

2. Start the API:

```bash
dotnet run
```

The API will start at https://localhost:7126.

### Start the Frontend

1. Open a new terminal and navigate to the frontend folder:

```bash
cd ../ecs_fe_map\ app
```

2. Start the development server:

```bash
npm run dev
```

The frontend will start at http://localhost:5173.

## Features

- Map-based visualization of field engineers and branches
- Service request management
- Real-time updates of field engineer locations
- Route visualization
- Branch management

## Technologies

- Frontend: React, TypeScript, Vite, Mapbox GL
- Backend: .NET Core 9, Entity Framework Core, MySQL
- UI: TailwindCSS, DaisyUI

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
