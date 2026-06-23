import React from "react";

// Make React available globally so that components compiled with the classic
// JSX runtime (React.createElement) work in the jsdom test environment.
(globalThis as { React?: typeof React }).React = React;

// Tell React's act() that we're in a test environment.
(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
