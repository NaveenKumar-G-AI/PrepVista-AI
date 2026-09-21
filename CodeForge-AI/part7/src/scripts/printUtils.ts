export function heading(title: string) {
  console.log('\n' + '='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
}
export function sub(title: string) {
  console.log('\n--- ' + title + ' ---');
}
export function assertTrue(condition: boolean, message: string) {
  if (!condition) {
    console.error('❌ ASSERTION FAILED:', message);
    process.exitCode = 1;
  } else {
    console.log('✅', message);
  }
}
