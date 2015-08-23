// An example Parse.js Backbone application based on the parseNote app by
// [Jérôme Gravel-Niquet](http://jgn.me/). This demo uses Parse to persist
// the parseNote items and provide user authentication and sessions.

$(function() {

  Parse.$ = jQuery;

  // Initialize Parse with your Parse application javascript keys
  Parse.initialize("Qe5rFk8qdUYnTURwyqIuEIRPFXonnFGujWpASGuM",
                   "WHhs8MnVrfNQLtXPyYQUXLJ6tMPtLg1xOX6ShJLR");

  // ParseNote Model
  // ----------
  // Our basic ParseNote model has `content`, `order`, and `done` attributes.
  var ParseNote = Parse.Object.extend("ParseNote", {
    // Default attributes for the parseNote.
    defaults: {
      content: "empty parseNote...",
      done: false
    },

    // Ensure that each parseNote created has `content`.
    initialize: function() {
      if (!this.get("content")) {
        this.set({"content": this.defaults.content});
      }
    },

    // Toggle the `done` state of this parseNote item.
    toggle: function() {
      this.save({done: !this.get("done")});
    }
  });

  // This is the transient application state, not persisted on Parse
  var AppState = Parse.Object.extend("AppState", {
    defaults: {
      filter: "all"
    }
  });

  // ParseNote Collection
  // ---------------

  var ParseNoteList = Parse.Collection.extend({

    // Reference to this collection's model.
    model: ParseNote,

    // Filter down the list of all parseNote items that are finished.
    done: function() {
      return this.filter(function(parseNote){ return parseNote.get('done'); });
    },

    // Filter down the list to only parseNote items that are still not finished.
    remaining: function() {
      return this.without.apply(this, this.done());
    },

    // We keep the ParseNotes in sequential order, despite being saved by unordered
    // GUID in the database. This generates the next order number for new items.
    nextOrder: function() {
      if (!this.length) return 1;
      return this.last().get('order') + 1;
    },

    // ParseNotes are sorted by their original insertion order.
    comparator: function(parseNote) {
      return parseNote.get('order');
    }

  });

  // ParseNote Item View
  // --------------

  // The DOM element for a parseNote item...
  var ParseNoteView = Parse.View.extend({

    //... is a list tag.
    tagName:  "li",

    // Cache the template function for a single item.
    template: _.template($('#item-template').html()),

    // The DOM events specific to an item.
    events: {
      "click .toggle"              : "toggleDone",
      "dblclick label.parseNote-content" : "edit",
      "click .parseNote-destroy"   : "clear",
      "keypress .edit"      : "updateOnEnter",
      "blur .edit"          : "close"
    },

    // The ParseNoteView listens for changes to its model, re-rendering. Since there's
    // a one-to-one correspondence between a ParseNote and a ParseNoteView in this
    // app, we set a direct reference on the model for convenience.
    initialize: function() {
      _.bindAll(this, 'render', 'close', 'remove');
      this.model.bind('change', this.render);
      this.model.bind('destroy', this.remove);
    },

    // Re-render the content of the parseNote item.
    render: function() {
      $(this.el).html(this.template(this.model.toJSON()));
      this.input = this.$('.edit');
      return this;
    },

    // Toggle the `"done"` state of the model.
    toggleDone: function() {
      this.model.toggle();
    },

    // Switch this view into `"editing"` mode, displaying the input field.
    edit: function() {
      $(this.el).addClass("editing");
      this.input.focus();
    },

    // Close the `"editing"` mode, saving changes to the parseNote.
    close: function() {
      this.model.save({content: this.input.val()});
      $(this.el).removeClass("editing");
    },

    // If you hit `enter`, we're through editing the item.
    updateOnEnter: function(e) {
      if (e.keyCode == 13) this.close();
    },

    // Remove the item, destroy the model.
    clear: function() {
      this.model.destroy();
    }

  });

  // The Application
  // ---------------

  // The main view that lets a user manage their parseNote items
  var ManageParseNotesView = Parse.View.extend({

    // Our template for the line of statistics at the bottom of the app.
    statsTemplate: _.template($('#stats-template').html()),

    // Delegated events for creating new items, and clearing completed ones.
    events: {
      "click .save_cont":  "createOnEnter",
      "click #clear-completed": "clearCompleted",
      "click #toggle-all": "toggleAllComplete",
      "click .log-out": "logOut",
      "click ul#filters a": "selectFilter"
    },

    el: ".content",

    // At initialization we bind to the relevant events on the `ParseNotes`
    // collection, when items are added or changed. Kick things off by
    // loading any preexisting parseNotes that might be saved to Parse.
    initialize: function() {
      var self = this;

      _.bindAll(this, 'addOne', 'addAll', 'addSome', 'render', 'toggleAllComplete', 'logOut', 'createOnEnter');

      // Main parseNote management template
      this.$el.html(_.template($("#manage-parseNotes-template").html()));
      
      this.input = this.$("#new-parseNote");
        this.contentTwo = this.$("#new-con");
      this.allCheckbox = this.$("#toggle-all")[0];

      // Create our collection of ParseNotes
      this.parseNotes = new ParseNoteList;

      // Setup the query for the collection to look for parseNotes from the current user
      this.parseNotes.query = new Parse.Query(ParseNote);
      this.parseNotes.query.equalTo("user", Parse.User.current());
        
      this.parseNotes.bind('add',     this.addOne);
      this.parseNotes.bind('reset',   this.addAll);
      this.parseNotes.bind('all',     this.render);

      // Fetch all the parseNote items for this user
      this.parseNotes.fetch();

      state.on("change", this.filter, this);
    },

    // Logs out the user and shows the login view
    logOut: function(e) {
      Parse.User.logOut();
      new LogInView();
      this.undelegateEvents();
      delete this;
    },

    // Re-rendering the App just means refreshing the statistics -- the rest
    // of the app doesn't change.
    render: function() {
      var done = this.parseNotes.done().length;
      var remaining = this.parseNotes.remaining().length;

      this.$('#parseNote-stats').html(this.statsTemplate({
        total:      this.parseNotes.length,
        done:       done,
        remaining:  remaining
      }));

      this.delegateEvents();

      /*this.allCheckbox.checked = !remaining;*/
    },

    // Filters the list based on which type of filter is selected
    selectFilter: function(e) {
      var el = $(e.target);
      var filterValue = el.attr("id");
      state.set({filter: filterValue});
      Parse.history.navigate(filterValue);
    },

    filter: function() {
      var filterValue = state.get("filter");
      this.$("ul#filters a").removeClass("selected");
      this.$("ul#filters a#" + filterValue).addClass("selected");
      if (filterValue === "all") {
        this.addAll();
      } else if (filterValue === "completed") {
        this.addSome(function(item) { return item.get('done') });
      } else {
        this.addSome(function(item) { return !item.get('done') });
      }
    },

    // Resets the filters to display all parseNotes
    resetFilters: function() {
      this.$("ul#filters a").removeClass("selected");
      this.$("ul#filters a#all").addClass("selected");
      this.addAll();
    },

    // Add a single parseNote item to the list by creating a view for it, and
    // appending its element to the `<ul>`.
    addOne: function(parseNote) {
      var view = new ParseNoteView({model: parseNote});
      this.$("#parseNote-list").append(view.render().el);
    },

    // Add all items in the ParseNotes collection at once.
    addAll: function(collection, filter) {
      this.$("#parseNote-list").html("");
      this.parseNotes.each(this.addOne);
    },

    // Only adds some parseNotes, based on a filtering function that is passed in
    addSome: function(filter) {
      var self = this;
      this.$("#parseNote-list").html("");
      this.parseNotes.chain().filter(filter).each(function(item) { self.addOne(item) });
    },

    // If you hit return in the main input field, create new ParseNote model
    createOnEnter: function(e) {

        var self = this;
      /*if (e.keyCode != 13) return;*/
      this.parseNotes.create({
        content: this.input.val(),
        title: this.contentTwo.val(),
        order:   this.parseNotes.nextOrder(),
        done:    false,
        user:    Parse.User.current(),
        ACL:     new Parse.ACL(Parse.User.current())
      });

      this.input.val('');
        this.contentTwo.val("");
      this.resetFilters();
    },

    // Clear all done parseNote items, destroying their models.
    clearCompleted: function() {
      _.each(this.parseNotes.done(), function(parseNote){ parseNote.destroy(); });
      return false;
    },

    toggleAllComplete: function () {
      var done = this.allCheckbox.checked;
      this.parseNotes.each(function (parseNote) { parseNote.save({'done': done}); });
    }
  });

  var LogInView = Parse.View.extend({
    events: {
      "submit form.login-form": "logIn",
      "submit form.signup-form": "signUp"
    },

    el: ".content",
    
    initialize: function() {
      _.bindAll(this, "logIn", "signUp");
      this.render();
    },

    logIn: function(e) {
      var self = this;
      var username = this.$("#login-username").val();
      var password = this.$("#login-password").val();
      
      Parse.User.logIn(username, password, {
        success: function(user) {
          new ManageParseNotesView();
          self.undelegateEvents();
          delete self;
        },

        error: function(user, error) {
          self.$(".login-form .error").html("用户名或密码不正确，请重新输入！").show();
          self.$(".login-form button").removeAttr("disabled");
        }
      });

      this.$(".login-form button").attr("disabled", "disabled");

      return false;
    },

    signUp: function(e) {
      var self = this;
      var username = this.$("#signup-username").val();
      var password = this.$("#signup-password").val();
      
      Parse.User.signUp(username, password, { ACL: new Parse.ACL() }, {
        success: function(user) {
          new ManageParseNotesView();
          self.undelegateEvents();
          delete self;
        },

        error: function(user, error) {
          self.$(".signup-form .error").html(_.escape(error.message)).show();
          self.$(".signup-form button").removeAttr("disabled");
        }
      });

      this.$(".signup-form button").attr("disabled", "disabled");

      return false;
    },

    render: function() {
      this.$el.html(_.template($("#login-template").html()));
      this.delegateEvents();
    }
  });

  // The main view for the app
  var AppView = Parse.View.extend({
    // Instead of generating a new element, bind to the existing skeleton of
    // the App already present in the HTML.
    el: $("#parseNoteapp"),

    initialize: function() {
      this.render();
    },

    render: function() {
      if (Parse.User.current()) {
        new ManageParseNotesView();
      } else {
        new LogInView();
      }
    }
  });

  var AppRouter = Parse.Router.extend({
    routes: {
      "all": "all",
      "active": "active",
      "completed": "completed"
    },

    initialize: function(options) {
    },

    all: function() {
      state.set({ filter: "all" });
    },

    active: function() {
      state.set({ filter: "active" });
    },

    completed: function() {
      state.set({ filter: "completed" });
    }
  });

  var state = new AppState;

  new AppRouter;
  new AppView;
  Parse.history.start();
});
