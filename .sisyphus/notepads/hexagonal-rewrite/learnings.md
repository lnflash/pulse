## Cutover and Deployment Configuration
- Updated `docs/CUTOVER.md` with a detailed 4-phase plan, rollback procedures, and a 24-hour monitoring checklist.
- Enhanced `.env.production.example` to include WhatsApp Cloud API, Redis pool, and cache warming configurations.
- Refactored `ecosystem.prod.config.js` to support both monolith (in-process) and multi-process (RabbitMQ) deployment modes.
- Verified that the build passes and the PM2 configuration is valid.
