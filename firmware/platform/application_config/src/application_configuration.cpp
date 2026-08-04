#include "application_configuration.hpp"

namespace simcore::configuration {

const char* board_id_name(const BoardId board) {
  switch (board) {
    case BoardId::t_display_s3:
      return "t_display_s3";
    case BoardId::guition_esp32_4848s040:
      return "guition_esp32_4848s040";
  }
  return "unknown";
}

bool board_id_from_name(const std::string_view name, BoardId& board) {
  if (name == "t_display_s3") {
    board = BoardId::t_display_s3;
    return true;
  }
  if (name == "guition_esp32_4848s040") {
    board = BoardId::guition_esp32_4848s040;
    return true;
  }
  return false;
}

}  // namespace simcore::configuration
