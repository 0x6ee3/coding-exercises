// Process-only fixture: deliberately never opens a service or consumes tracker events.
if (process.argv.includes('exit')) process.exit(7);
setInterval(() => {}, 1000);
