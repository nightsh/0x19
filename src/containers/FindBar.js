import React, { Component, PropTypes } from 'react';
import fuzzy from 'fuzzy';
import _ from 'lodash';
import { runCommand } from '../actions/findbar';
import { connect } from 'react-redux';
import styles from './FindBar.css';

class FindBar extends Component {
  constructor(props) {
    super(props);
    this._compiledCommands = {};
    this.state = {
      value: '',
      placeholder: '',
      activeScope: null,
      isOpen: false,
      highlightedIndex: 0,
    };

    this._getSuggestions = _.memoize(this._getSuggestions, (value, activeScope) => value + activeScope);
    this.compileCommand = this.compileCommand.bind(this);
    this.matchCommand = this.matchCommand.bind(this);
    this.maybeRemoveActiveScope = this.maybeRemoveActiveScope.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleInputBlur = this.handleInputBlur.bind(this);
    this.handleInputFocus = this.handleInputFocus.bind(this);
    this.handleInputClick = this.handleInputClick.bind(this);
    this.getSuggestions = this.getSuggestions.bind(this);
    this.highlightCommandFromMouse = this.highlightCommandFromMouse.bind(this);
    this.selectCommandFromMouse = this.selectCommandFromMouse.bind(this);
    this.setIgnoreBlur = this.setIgnoreBlur.bind(this);
  }

  componentWillMount() {
    this._ignoreBlur = false;
  }

  componentDidMount() {
    this._compiledCommands = this.props.commands.map(this.compileCommand);
  }

  _escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  _camelCaseToSpace(string) {
    const result = string.replace(/([A-Z])/g, ' $1');
    return result.charAt(0).toUpperCase() + result.slice(1);
  }

  // Generates a regexp and splits a token and param details for a command
  compileCommand(command) {
    let regexp = '';
    let param = null;

    const matcher = /\(:([a-zA-Z_$][a-zA-Z0-9_$]*)(?:(?: as )(.*))?\)/g;
    const match = matcher.exec(command.pattern);
    const matchIndex = match ? match.index : command.pattern.length;

    const token = command.pattern.slice(0, matchIndex) || command.token;
    regexp += this._escapeRegExp(command.pattern.slice(0, matchIndex));

    if (match && match[1]) {
      regexp += '(.*)';
      param = { name:match[1], display:match[2] || this._camelCaseToSpace(match[1]) };
    }

    console.log(Object.assign({}, command, {
      regexp,
      token,
      param
    }));

    return Object.assign({}, command, {
      regexp,
      token,
      param
    });
  }

  // Check if the entered string matches any command.
  // adds a scope (so user can type param value) and dispatches action for fully matched commands
  matchCommand() {
    const string = this.state.activeScope ? this.state.activeScope + this.state.value : this.state.value;
    let match;
    const command = this._compiledCommands.find(command => {
      match = string.match(RegExp(`^${command.regexp}`, 'i'));
      return match;
    });

    const paramName = command.param ? command.param.name : null;
    const enteredParamValue = command.param && match[1] ? match[1].trim() : null;

    if (!command) {
      // No matched command
      return null;
    } else if (command.param && !enteredParamValue) {
      // Partial Match
      // Command was partially matched: It requires a param, but param wasn't entered
      // Set a scope so user can fill the param
      this.setState({
        value: '',
        activeScope: command.token,
        placeholder: command.param.display
      });
    } else {
      // Match
      // Command was matched and either it doesn't require a param or it's required param was entered
      // Dispatch action
      const payload = paramName ? { [paramName]: enteredParamValue } : null;
      this.props.dispatch(runCommand(command.token, payload));
    }
  }

  maybeRemoveActiveScope() {
    if (this.state.value.length === 0 && this.state.activeScope) {
      this.setState({
        activeScope: null,
        placeholder: ''
      });
    }
  }

  getSuggestions() {
    return this._getSuggestions(this.state.value, this.state.activeScope, this._compiledCommands);
  }
  // Memoized version
  _getSuggestions(value, scope, commands) {
    if (scope) return []; // No autocomplete for scoped input
    const results = fuzzy.filter(value, commands, {
      //pre: '<strong>',
      //post: '</strong>',
      extract: el => el.token
    });
    return results.slice(0, 5).map(result => result.original);
  }

  handleKeyDown(event) {
    let highlightedIndex, index;
    switch (event.key) {
      case 'Backspace':
        this.maybeRemoveActiveScope();
        break;
      case 'ArrowDown':
        event.preventDefault();
        highlightedIndex = this.state.highlightedIndex;
        index = (
          highlightedIndex === this.getSuggestions().length - 1 ||
          this.state.isOpen === false
        ) ?  0 : highlightedIndex + 1;
        this.setState({
          highlightedIndex: index,
          isOpen: true,
        });
        break;
      case 'ArrowUp':
        event.preventDefault();
        highlightedIndex = this.state.highlightedIndex;
        index = (
          highlightedIndex === 0
        ) ? this.getSuggestions().length - 1 : highlightedIndex - 1;
        this.setState({
          highlightedIndex: index,
          isOpen: true,
        });
        break;
      case 'Enter':
        if (this.state.isOpen) {
          const command = this.getSuggestions()[this.state.highlightedIndex];
          const newState = {
            isOpen: false,
            highlightedIndex: 0
          };
          if (command) {
            newState.value = command.token;
          }
          this.setState(newState, () => {
            this._input.focus();
            this._input.setSelectionRange(
              this.state.value.length,
              this.state.value.length
            );
            this.matchCommand();
          });
        }
        break;
      case 'Escape':
        this.setState({
          highlightedIndex: 0,
          isOpen: false
        }, this.maybeRemoveActiveScope);
        break;
      default:
        this.setState({
          highlightedIndex: 0,
          isOpen: true
        });
    }
  }

  handleChange(event) {
    this.setState({
      value: event.target.value,
    });
  }

  handleInputBlur() {
    if (this._ignoreBlur) return;
    this.setState({
      isOpen: false,
      highlightedIndex: 0
    });
  }

  handleInputFocus() {
    if (this._ignoreBlur) return;
    this.setState({ isOpen: true });
  }

  handleInputClick() {
    if (this.state.isOpen === false)
      this.setState({ isOpen: true });
  }

  highlightCommandFromMouse(index) {
    this.setState({ highlightedIndex: index });
  }

  selectCommandFromMouse(command) {
    this.setState({
      value: command.token,
      isOpen: false,
      highlightedIndex: 0
    }, () => {
      this.matchCommand();
      this._input.focus();
      this.setIgnoreBlur(false);
    });
  }

  setIgnoreBlur(ignore) {
    this._ignoreBlur = ignore;
  }

  renderMenu() {
    const commands = this.getSuggestions().map((command, index) => {
      return (
        <div
            className={this.state.highlightedIndex === index ? styles.highlightedCommand : styles.command}
            key={command.token.trim().replace(/[^a-z0-9]+/gi, '-')}
            onMouseDown={() => this.setIgnoreBlur(true)}
            onMouseEnter={() => this.highlightCommandFromMouse(index)}
            onClick={() => this.selectCommandFromMouse(command)}
            ref={`command-${index}`}
        >{command.token}</div>
      );
    });

    return commands.length > 0 ? <div className={styles.menu} children={commands} /> : null;
  }

  renderActiveScope() {
    return <div className={styles.inputScope}>{this.state.activeScope}</div>;
  }

  render() {
    const menu = this.state.isOpen && this.renderMenu();
    const scope = this.state.activeScope && this.renderActiveScope();
    return (
      <div className={styles.root}>
        <label className={styles.inputArea}>
          {scope}
          <input
              className={styles.inputField}
              ref={(c) => this._input = c}
              onFocus={this.handleInputFocus}
              onBlur={this.handleInputBlur}
              onChange={this.handleChange}
              onKeyDown={this.handleKeyDown}
              onClick={this.handleInputClick}
              placeholder={this.state.placeholder}
              value={this.state.value}
          />
        </label>
        {menu}
      </div>
    );
  }
}
FindBar.propTypes = {
  commands: PropTypes.array.isRequired,
  dispatch: PropTypes.func.isRequired,
};

export { FindBar };
export default connect()(FindBar);
