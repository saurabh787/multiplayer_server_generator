let start = Date.now();

setInterval(() => {
  const now = Date.now();
  const lag = now - start - 1_000;
  // eslint-disable-next-line no-console
  console.log(`[event-loop] lagMs=${lag}`);
  start = now;
}, 1_000);
