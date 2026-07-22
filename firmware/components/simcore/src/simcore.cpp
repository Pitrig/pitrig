#include "simcore/simcore.hpp"

#include "simcore/logger.hpp"

namespace simcore {
namespace {

constexpr char kTag[] = "simcore";

}

void run() {
  log::info(kTag, "SimCore starting");
}

}
