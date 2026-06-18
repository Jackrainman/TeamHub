/**
 * 快照浅克隆共享辅助：浅拷贝对象 + spread 指定的每个数组字段，使写方法 push/splice 时不污染共享 fixture。
 *
 * 收口 file-gov-store / file-kb-store / mock-gov-store / mock-kb-store 此前各自内联的同形克隆逻辑
 * （`{ ...seed, arr: [...seed.arr], ... }`）——逻辑镜像、易随快照增字段漂移，提取为单一泛型实现。
 * 仅克隆**被写方法触及**的数组字段；标量与未列出的字段沿用浅拷贝引用（与原内联行为逐字等价）。
 */
export function cloneArrayFields<T extends object>(seed: T, keys: (keyof T)[]): T {
  const clone = { ...seed };
  for (const key of keys) {
    const value = seed[key];
    if (Array.isArray(value)) {
      // 浅拷贝该数组字段；类型上 T[key] 即数组类型，运行期 spread 等价于原 [...seed.arr]。
      clone[key] = [...value] as T[typeof key];
    }
  }
  return clone;
}
