# Pulse - Rust Rewrite

WhatsApp Bitcoin wallet bot rewritten in Rust following clean architecture principles.

## Status

🚧 **Work in Progress** - Phase 1 Complete

- ✅ Cargo workspace initialized
- ✅ Core domain models created
- ✅ Error handling framework setup
- ✅ Application compiles successfully
- 🚧 Configuration management (in progress)
- ⏳ Redis integration (pending)
- ⏳ Flash API client (pending)
- ⏳ WhatsApp integration (pending)
- ⏳ Command handlers (pending)

## Quick Start

### Prerequisites

- Rust 1.90+ (run `rustup update` if needed)
- Redis (optional for now, will be required later)

### Build

```bash
# Development build
cargo build

# Release build (optimized)
cargo build --release
```

### Run

```bash
# Development mode with debug logging
RUST_LOG=pulse=debug cargo run --bin pulse

# Release mode
./target/release/pulse
```

### Configuration

Create a `.env.rust` file in the project root (see `.env.rust` example).

## Project Structure

```
pulse/
├── Cargo.toml              # Workspace configuration
└── crates/
    ├── pulse-domain/       # Pure business logic (no external deps)
    ├── pulse-application/  # Use cases & application services
    ├── pulse-infrastructure/ # External integrations (Redis, GraphQL, WhatsApp)
    ├── pulse-api/         # HTTP/WebSocket API (Axum)
    └── pulse-server/      # Main binary entry point
```

## Architecture

Following **Hexagonal/Clean Architecture**:

- **Domain Layer** (`pulse-domain`): Core business types, no external dependencies
- **Application Layer** (`pulse-application`): Use cases, defines ports (interfaces)
- **Infrastructure Layer** (`pulse-infrastructure`): Implements ports, handles external services
- **API Layer** (`pulse-api`): HTTP handlers and routes
- **Server** (`pulse-server`): Main binary that wires everything together

## Development

### Adding Dependencies

Add to `Cargo.toml` in the `[workspace.dependencies]` section, then reference in individual crate `Cargo.toml` files.

### Testing

```bash
cargo test
```

### Linting

```bash
cargo clippy -- -D warnings
```

### Formatting

```bash
cargo fmt
```

## Roadmap

See `TODO.md` for detailed task breakdown.

**Current Phase:** 1.2 - Configuration Management

**Next Phases:**
- Phase 2: Redis Integration
- Phase 3: Flash API GraphQL Client
- Phase 4: WhatsApp Integration
- Phase 5: Core Commands (link, balance, send)
- Phase 6: Session & Auth
- Phase 7: Payment Features
- Phase 8: Advanced Features (AI, voice, admin)
- Phase 9: Testing & Documentation

## Performance

Rust build is significantly faster and produces a much smaller binary:

- **Binary size:** ~15MB (vs ~200MB Node.js bundle)
- **Memory usage:** Expected 10-50MB (vs 150-300MB Node.js)
- **Cold start:** <100ms (vs 2-3s Node.js)

## License

UNLICENSED
