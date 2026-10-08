// Compatibility interface retained for the public example.
// Private-image matching and digest handling are disabled.
export function createVerifiedPhotoSourceShare() {
  return {
    async consider() { return false; },
    commit() { return { shared: 0, reason: 'disabled-in-public-example' }; }
  };
}
