import React from "react";

// Make React available globally so that components compiled with the classic
// JSX runtime (React.createElement) work in the jsdom test environment.
globalThis.React = React;

// Tell React's act() that we're in a test environment.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
