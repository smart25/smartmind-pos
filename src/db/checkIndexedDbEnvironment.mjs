import 'fake-indexeddb/auto';

console.log('global indexedDB available:', typeof indexedDB !== 'undefined');
console.log('global window available:', typeof window !== 'undefined');
console.log(
  'window.indexedDB available:',
  typeof window !== 'undefined' && Boolean(window.indexedDB)
);
