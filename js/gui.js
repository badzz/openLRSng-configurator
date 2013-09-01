// GUI control object, storing current UI state, currently locked elements, etc
// Mode guide -
// 0 = disconnected (or "connection not established yet")
// 1 = normal operation (configurator)
// 2 = firmware flash mode
// 3 = spectrum analyzer mode
var GUI_control = function() {
    this.auto_connect = 0;
    this.operating_mode = 0;
    this.connect_lock = false;
    this.tab_lock = [1, 1, 1, 0]; // needs to match tab count
    this.active_tab = -1; // -1 = no tab active
    
    this.interval_array = [];
    this.timeout_array = [];
};

// Tab managing methods

// index = tab index
GUI_control.prototype.lock = function(index) {
    this.tab_lock[index] = 1;
};

// index = tab index
GUI_control.prototype.unlock = function(index) {
    this.tab_lock[index] = 0;
};

// state = true (lock all tabs)
// state = false (unlock all tabs)
GUI_control.prototype.lock_all = function(state) {
    if (state) { // lock all
        for (var i = 0; i < this.tab_lock.length; i++) {
            this.tab_lock[i] = 1;
        }
    } else { // unlock all
        for (var i = 0; i < this.tab_lock.length; i++) {
            this.tab_lock[i] = 0;
        }
    }
};

// Timer managing methods

// name = string
// code = function reference (code to be executed)
// interval = time interval in miliseconds
GUI_control.prototype.interval_add = function(name, code, interval) {
    var data = {'name' : name, 'timer' : undefined, 'fired' : 0};
    
    data.timer = setInterval(function() {
        code(); // execute code
        
        data.fired++; // increment counter
    }, interval);
    
    this.interval_array.push(data); // push to primary interval array
};

// name = string
GUI_control.prototype.interval_remove = function(name) {
    for (var i = 0; i < this.interval_array.length; i++) {
        if (this.interval_array[i].name == name) {
            clearInterval(this.interval_array[i].timer); // stop timer
            
            this.interval_array.splice(i, 1); // remove element/object from array
        
            return true;
        }
    }
    
    return false;
};

// no input paremeters
// return = returns timers killed in last call
GUI_control.prototype.interval_kill_all = function() {
    var timers_killed = this.interval_array.length;
    
    for (var i = 0; i < this.interval_array.length; i++) {
        clearInterval(this.interval_array[i].timer); // stop timer
        this.interval_array.splice(i, 1); // remove element/object from array
    }
    
    return timers_killed;
};

// name = string
// code = function reference (code to be executed)
// timeout = timeout in miliseconds
GUI_control.prototype.timeout_add = function(name, code, timeout) {
    var self = this;
    // start timer with "cleaning" callback
    var timer = setTimeout(function() {
        code(); // execute code
        
        self.timeout_remove(name); // cleanup
    }, timeout);
    
    this.timeout_array.push({'name' : name, 'timer' : timer}); // push to primary timeout array
};

// name = string
GUI_control.prototype.timeout_remove = function(name) {
    for (var i = 0; i < this.timeout_array.length; i++) {
        if (this.timeout_array[i].name == name) {
            clearTimeout(this.timeout_array[i].timer); // stop timer
            
            this.timeout_array.splice(i, 1); // remove element/object from array
            
            return true;
        }
    }
    
    return false;
};

// no input paremeters
// return = returns timers killed in last call
GUI_control.prototype.timeout_kill_all = function() {
    var timers_killed = this.timeout_array.length;
    
    for (var i = 0; i < this.timeout_array.length; i++) {
        clearInterval(this.timeout_array[i].timer); // stop timer
        this.timeout_array.splice(i, 1); // remove element/object from array
    }
    
    return timers_killed;
};

// initialize object into GUI variable
var GUI = new GUI_control();