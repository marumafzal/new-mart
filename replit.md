# AJKMart Super-App Monorepo

## Overview

AJKMart is a multi-service super-app platform designed for the AJK region of Pakistan. It integrates e-commerce, food delivery, ride-hailing, pharmacy services, parcel delivery, and inter-city transport into a single platform. The project aims to provide a robust, low-resource-friendly experience optimized for environments with slow networks and budget devices. The system comprises four user-facing applications (customer mobile/web, rider PWA, vendor portal, admin panel) supported by a Node.js API server and PostgreSQL database.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure

The project is structured as a pnpm workspace monorepo, enforcing pnpm usage. It includes shared libraries for database schema, API client, validation, and internationalization, consumed by various deployable applications such as the API server, admin panel, rider app, vendor app, and customer super-app. TypeScript project references are used for efficient type-checking and build processes.

### Applications

1.  **api-server**: A Node.js/Express backend providing a unified API for all clients. It uses Drizzle ORM for database interactions, Zod for validation, and Socket.IO for real-time features.
2.  **admin**: A React + Vite application serving as the central administration panel, featuring a "Command Center" design with various modules for operations, inventory, finance, safety, and configuration.
3.  **rider-app**: A React + Vite PWA for riders, including mapping, GPS tracking, order/ride management, and financial features.
4.  **vendor-app**: A React + Vite application for vendors to manage products, inventory, and orders.
5.  **ajkmart**: An Expo / React Native customer super-app, supporting mobile and web builds, with features like biometrics, deep linking for authentication, and network-aware image loading.

### Backend Architecture

The backend leverages Express with Zod validation, JWT-based authentication, CSRF protection, and rate limiting. Socket.IO facilitates real-time events. A multi-method authentication system supports Phone/Email OTP, Username/Password, OAuth, magic links, and TOTP 2FA, with methods togglable via platform configuration. A hybrid wallet model manages commissions and rider balances, with atomic transactions for critical operations. A central platform configuration endpoint allows dynamic control over features, pricing, and service settings.

### Frontend Architecture

The customer app uses Expo, supporting lazy-loaded service modules that are toggled via feature flags in platform config. React Query is used for server state management with AsyncStorage persistence for offline resilience. The project supports trilingual internationalization (English/Urdu/Roman Urdu) via a shared library. A consistent design system is applied across applications, utilizing Lucide icons for web and Ionicons for Expo, with specific color palettes per application.

### Data Layer

PostgreSQL is the chosen database, with schema managed by Drizzle ORM. Drizzle Kit is used for migrations. The schema is organized by domain, covering users, orders, products, rides, wallets, and platform settings.

### Key Architectural Decisions

-   **Single API Server**: Chosen for simplicity, cost efficiency, and easier transaction consistency, suitable for the target regional scale.
-   **pnpm Workspace**: Preferred over more complex monorepo tools for its simplicity and sufficiency for project needs.
-   **Expo for Customer App**: Enables a single codebase for iOS/Android/Web, balancing native capabilities with web compatibility.
-   **Admin-Driven Configuration**: Most business logic and feature toggles are controllable via the admin panel, reducing the need for code redeploys.
-   **Manual Payment Verification**: Aligns with local payment habits and avoids initial gateway fees by supporting bank transfers with admin verification.

## External Dependencies

### Core Runtime & Frameworks
-   **Node.js**, **Express**, **Socket.IO**, **Drizzle ORM**, **Zod** (API server).
-   **PostgreSQL** (database).
-   **React 19**, **Vite** (admin/rider/vendor web apps).
-   **Wouter**, **React Router**, **Expo Router** (routing).
-   **Expo SDK** (with `expo-secure-store`, `expo-local-authentication`, `expo-image`, `expo-auth-session`, `expo-camera`, `expo-store-review`, `expo-linking`).
-   **EAS CLI** (for native builds).

### Authentication & Security
-   **@react-oauth/google** (Google sign-in).
-   **Facebook SDK**.
-   **JWT**, **bcrypt**, **TOTP** (2FA), **reCAPTCHA v3**.

### Maps & Location
-   **Leaflet** (web maps).
-   **NetInfo** (network quality detection).

### Real-time & State
-   **Socket.IO** (real-time communication).
-   **TanStack React Query** (server state management with offline persistence).

### Payment & Wallet
-   Integration with **JazzCash**, **EasyPaisa**, **Bank Transfer** (manual verification).

### Notifications
-   **Expo push tokens** (mobile push notifications).
-   **SMS / WhatsApp / Email OTP** (provider abstracted).

### Tooling
-   **TypeScript 5.9**, **Prettier 3.8**.
-   **pnpm**.
-   **Drizzle Kit** (migrations).
-   **Sentry** (error reporting).