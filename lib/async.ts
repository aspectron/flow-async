
export const dpc = (delay: number | Function, fn ? : Function | number) => {
    if (typeof delay == 'function') {
        let temp = fn as number;
        fn = delay;
        delay = temp;
    }
    return setTimeout(fn as Function, delay || 0);
}


export const clearDPC = (dpc_:number)=>{
	clearTimeout(dpc_);
}

export class Semaphore<T> extends Promise<T> {
	name:string;
	resolve?:Function;
	reject?:Function;
	constructor(name:string) {
		super((resolve_:Function, reject_:Function) => {
			this.resolve = resolve_;
			this.reject = reject_;
		})
		this.name = name;
	}

	// you can also use Symbol.species in order to
	// return a Promise for then/catch/finally
	static get [Symbol.species]() {
		return Promise;
	}

	// Promise overrides his Symbol.toStringTag
	get [Symbol.toStringTag]() {
		return 'Semaphore';
	}
}

export const timeout = (ms:number, reason = 'timeout') => {
    let methods:Record<string,Function> = {};
    let timer:NodeJS.Timeout;
    const p = new Promise((resolve, reject) => {
        methods.cancel = () => {
            if (timer) {
                clearTimeout(timer);
            }
        };
        timer = setTimeout(() => {
            reject(reason);
        }, ms);
    });
    // noinspection JSUnusedAssignment
    return Object.assign(p, methods);
}

export const delay = (ms = 0, value:any) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(value);
        }, ms);
    });
}

export interface DeferredPromise extends Promise<any> {
    resolve(data?:any):void;
    reject(error?:any):void;
}
export const Deferred = (): DeferredPromise=>{
    let methods = {};
    let promise = new Promise((resolve, reject)=>{
        methods = {resolve, reject};
    })
    Object.assign(promise, methods);
    return promise as DeferredPromise;
}


export class AsyncQueue {

	pending:any[];
	processed:number;
	inflight:number;
	signal:DeferredPromise;
	max:number;
	error:any;

	private active:boolean;
	private abort:boolean;
	private done:boolean;
	private reset_:boolean;

	constructor(opt:any={}) {
		this.pending = [];
        this.processed = 0;
        this.inflight = 0;
		this.signal = Deferred();
		this.max = opt?.max || 0;
		this.active = false;
		this.abort = false;
		this.done = false;
		this.reset_ = false;
	}
	[Symbol.asyncIterator]() { return this.iterator(); }
	post(v:any, post_if_iterator_is_active:boolean) {
		if(this.done)
			return;
		if(post_if_iterator_is_active && !this.active)
			return;
		if(this.max) {
			while(this.pending.length >= this.max)
				this.pending.shift();
		}
		this.pending.push(v);
		this.signal.resolve();
	}
	stop(error?:any) {
		this.error = error;
		this.abort = true;
		this.done = true;
		if(!this.inflight) {
			this.signal.resolve();
		}
	}
	clear() {
		this.pending = [];
		if(this.inflight) {
			this.abort = true;
			this.reset_ = true;
		}
	}
    get length() {
        return this.pending.length+this.inflight;
    }
	async *iterator() {

		this.active = true;

		if(this.done) {
			this.done = false;
			if(!this.pending.length)
				this.signal = Deferred();
		}

		while(true) {
			if(this.pending.length === 0) {
				await this.signal;
			}
			if (this.error)
				throw this.error;

			const pending = this.pending;
			this.inflight = pending.length;
			this.pending = [];
			let processed = 0;
			for (; processed < pending.length && !this.abort; processed++) {
                this.processed++;
                yield pending[processed];
				this.inflight--;
			}


			if(this.reset_) {
				this.abort = false;
				this.reset_ = false;
				pending.length = 0;
			}

			if(this.done) {
				this.abort = false;
				const incoming = this.pending.length;
				if(incoming)
					this.pending = processed ? pending.slice(processed).concat(this.pending) : pending.concat(this.pending);
				else
					this.pending = processed ? pending.slice(processed) : pending;
				this.inflight = 0;
				break;
			}
			else if (this.pending.length === 0) {
				this.inflight = 0;
				pending.length = 0;
				this.pending = pending;
				this.signal = Deferred();
			}
		}

		this.active = false;
	}
}

export class AsyncQueueSubscriberMap {
	lossless:boolean;
	map:Map<string,AsyncQueue[]>;

	constructor(options?:any) {
		this.lossless = options?.lossless || false;
		this.map = new Map();
	}

	subscribe(subject:string) {
		let subscribers = this.map.get(subject);
		if(!subscribers) {
			subscribers = [];
			this.map.set(subject,subscribers);
		}
		let queue:AsyncQueue = new AsyncQueue();
		subscribers.push(queue);
		return queue;
	}

	post(subject:string, msg:any) {
		let subscribers = this.map.get(subject);
		if(subscribers)
			for(const subscriber of subscribers)
				subscriber.post(msg, this.lossless);
	}

	shutdown() {
		this.map.forEach((subscribers) => {
			subscribers.forEach(queue => {
				queue.stop();
				queue.clear();
			});
		});
		this.map.clear();
	}
}

