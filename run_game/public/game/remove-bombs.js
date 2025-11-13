(function () {
  if (!window.cr || !window.cr.createRuntime) {
    return;
  }

  const bombTypeNames = new Set(["t9", "t36"]);

  const destroyExisting = (runtime) => {
    if (!runtime || !runtime.types_by_index) {
      return;
    }
    runtime.types_by_index.forEach((type) => {
      if (!type || !bombTypeNames.has(type.name) || !type.instances) {
        return;
      }
      // clone so we can safely destroy while iterating
      type.instances.slice().forEach((inst) => {
        if (inst && !inst.is_destroyed) {
          inst.destroy();
        }
      });
    });
  };

  const originalCreateInstance = cr.Runtime.prototype.createInstance;
  cr.Runtime.prototype.createInstance = function (type, ...rest) {
    if (type && bombTypeNames.has(type.name)) {
      return null;
    }
    const inst = originalCreateInstance.call(this, type, ...rest);
    if (inst && inst.type && bombTypeNames.has(inst.type.name)) {
      inst.destroy();
      return null;
    }
    return inst;
  };

  const wrapRuntimeFactory = (factoryName) => {
    const originalFactory = window[factoryName];
    if (typeof originalFactory !== "function") {
      return;
    }
    window[factoryName] = function (...args) {
      const runtime = originalFactory.apply(this, args);
      destroyExisting(runtime);
      return runtime;
    };
  };

  wrapRuntimeFactory("cr_createRuntime");
  wrapRuntimeFactory("cr_createDCRuntime");
})();

