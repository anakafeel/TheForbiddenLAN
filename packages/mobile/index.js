// Import crypto polyfill FIRST — must be loaded before @forbiddenlan/comms
import "./src/shims/setup-crypto";

import { registerRootComponent } from "expo";
import App from "./src/App";

registerRootComponent(App);