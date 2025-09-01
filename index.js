import { Agent } from "./agent/index.js";
import {
  PinataStorageProvider,
  SwarmStorageProvider,
  BaseStorageProvider,
} from "./storage/index.js";
import { DataAccessProvider, TacoProvider } from "./data-access/index.js";

export {
  Agent,
  PinataStorageProvider,
  SwarmStorageProvider,
  BaseStorageProvider,
  DataAccessProvider,
  TacoProvider,
};

export default {
  Agent,
  BaseStorageProvider,
  PinataStorageProvider,
  SwarmStorageProvider,
  DataAccessProvider,
  TacoProvider,
};
