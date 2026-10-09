// Every diagram, one ES module each, re-exported here so the index and
// viewer pages (and the test) have a single list to walk.
import * as pythagoras from "./diagrams/pythagoras.js";
import * as socrates from "./diagrams/socrates.js";
import * as plato from "./diagrams/plato.js";
import * as aristotle from "./diagrams/aristotle.js";
import * as fourKnowings from "./diagrams/four-knowings.js";
import * as threeBody from "./diagrams/three-body.js";
import * as humanComputer from "./diagrams/human-computer.js";
import * as sophon from "./diagrams/sophon.js";
import * as darkForest from "./diagrams/dark-forest.js";
import * as droplet from "./diagrams/droplet.js";

export const manifest = [
  pythagoras,
  socrates,
  plato,
  aristotle,
  fourKnowings,
  threeBody,
  humanComputer,
  sophon,
  darkForest,
  droplet,
];
