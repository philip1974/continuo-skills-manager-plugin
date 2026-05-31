# sdk-adapter

验证 globalThis.co Proxy bridge 正确连接业务代码与 Continuo runtime。

## 6 case

1. globalThis.co 被 setupFile 正确注入
2. main.ts default export 是 globalThis.co.Plugin 子类
3. sdk-shim co.React === globalThis.co.React (Proxy 透传)
4. sdk-shim co.z === globalThis.co.z (Proxy 透传)
5. 多个 spec 之间 globalThis.co 不漂移 (setupFile 隔离)
6. **negative**: 删 globalThis.co 后访问 co.Plugin 必须 throw (锁 Proxy 行为)
