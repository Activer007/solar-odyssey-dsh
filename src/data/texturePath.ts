// Standalone preview serves the source files. The DSH build substitutes this
// module with URLs from the package-aware Client asset resolver.
export function texturePath(filename: string): string {
  return `/textures/${filename}`;
}
