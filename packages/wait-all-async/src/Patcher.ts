import {AsyncCounter} from './AsyncCounter'

type Patch = {
    t: 'callback'
    name: string
    fn: Function
} | {
    t: 'timeout'
    name: string
    fn: Function
} | {
    t: 'method'
    name: string
    proto: Object
    fn: Function
} | {
    t: 'prop'
    name: string
    proto: Object
    desc: PropertyDescriptor
}

export class Patcher {
    private counter: AsyncCounter
    private patches: Patch[] = []

    constructor(
        resolve: () => void,
        reject: (e: Error) => void,
        public target: Object,
        timeout: number = 4000
    ) {
        this.counter = new AsyncCounter(
            (e?: Error) => {
                this.restore()
                if (e) reject(e)
                else resolve()
            },
            timeout
        )
    }

    callback(
        name: string,
        canRemove?: (...args: any[]) => boolean,
        callbackPos: number = 0
    ) {
        const {patches, target, counter} = this
        const fn: (...args: any[]) => any = target[name]

        function newCb(...args: any[]) {
            let handler: any
            const callback = args[callbackPos]

            function newCallback() {
                try {
                    return callback.apply(this, arguments)
                } finally {
                    if (!canRemove || canRemove.apply(this, arguments)) counter.decrement(handler)
                }
            }

            args[callbackPos] = newCallback
            handler = fn.apply(this, args)
            counter.increment(handler)

            return handler
        }
        target[name] = newCb

        patches.push({t: 'callback', name, fn})
    }

    handler(name: string) {
        const {patches, target, counter} = this
        const fn: (...args: any[]) => any = target[name]

        function newTimeout(handler: any) {
            const result = fn.apply(this, arguments)
            counter.decrement(handler)
            return result
        }
        target[name] = newTimeout

        patches.push({t: 'timeout', name, fn})
    }

    promise(name: string) {
        const {target, counter, patches} = this
        const promise: typeof Promise = target[name]
        const proto = promise.prototype
        const origThen = proto.then
        const origCatch = proto.catch
    
        proto.then = function patchedThen(success, error) {
            counter.increment(this)
            const done = () => counter.decrement(this)
    
            const result = origThen.call(this, success, error)
            origThen.call(result, done, done)
    
            return result
        }
          
        proto.catch = function patchedCatch(error) {
            return origCatch.call(this, error).then()
        }
    
        patches.push({t: 'method', name: 'then', proto, fn: origThen})
        patches.push({t: 'method', name: 'catch', proto, fn: origCatch})
    }    

    method(
        className: string,
        name: string,
        canRemove?: (...args: any[]) => boolean
    ) {
        const {target, counter, patches} = this
        const proto = target[className].prototype
        const fn = proto[name]

        function newMethod(...args: any[]) {
            try {
                return fn.apply(this, args)
            } finally {
                counter.decrement(this)
            }
        }
        proto[name] = newMethod

        patches.push({t: 'method', name, proto, fn})
    }

    property(
        className: string,
        name: string,
        canRemove?: (...args: any[]) => boolean
    ) {
        const {target, counter, patches} = this
        const proto = target[className].prototype

        const desc = Object.getOwnPropertyDescriptor(proto, name)
        const newPropName = '$' + name

        Object.defineProperty(proto, name, {
            configurable: true,
            get() {
                return this[newPropName]
            },
            set(callback: Function) {
                const self = this
                function newCallback() {
                    try {
                        return callback.apply(this, arguments)
                    } finally {
                        if (!canRemove || canRemove.apply(this, arguments)) counter.decrement(self)
                    }
                }
                counter.increment(self)
                this[newPropName] = newCallback
            }
        })

        patches.push({t: 'prop', name, proto, desc: desc || {value: undefined, configurable: true}})
    }

    restore() {
        const {target, patches} = this
        for (let item of patches) {
            switch (item.t) {
                case 'timeout':
                case 'callback':
                    target[item.name] = item.fn
                    break
                case 'method':
                    item.proto[item.name] = item.fn
                    break
                case 'prop':
                    Object.defineProperty(item.proto, item.name, item.desc)
                    break
            }
        }

        this.patches = []
    }
}