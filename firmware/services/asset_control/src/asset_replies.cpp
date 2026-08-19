#include <array>
#include <cstdio>
#include <cstring>
#include <span>

#include "asset_control.hpp"
#include "transport.hpp"

// How an upload answers. Every reply names the asset kind in the same
// position, which is the whole reason these are not four snprintf calls
// scattered through the state machine.
namespace simcore::asset_control {

bool AssetControl::send_text(const char* const text) {
  return replies_to() != nullptr &&
         replies_to()->write(std::span<const std::uint8_t>(
             reinterpret_cast<const std::uint8_t*>(text), std::strlen(text)));
}

// Every reply names the kind in the same position, so the tag is written here
// and the caller supplies only what follows it.
bool AssetControl::send_ok(const char* const rest) {
  const int written =
      std::snprintf(response_.data(), response_.size(), "@SC:OK:%.*s:%s\n",
                    static_cast<int>(traits_.tag.size()), traits_.tag.data(),
                    rest);
  return written > 0 && static_cast<std::size_t>(written) < response_.size() &&
         send_text(response_.data());
}

bool AssetControl::send_error(const char* const word) {
  const int written =
      std::snprintf(response_.data(), response_.size(), "@SC:ERR:%.*s:%s\n",
                    static_cast<int>(traits_.tag.size()), traits_.tag.data(),
                    word);
  return written > 0 && static_cast<std::size_t>(written) < response_.size() &&
         send_text(response_.data());
}

void AssetControl::send_busy(transport::ITransport& reply) const {
  // "@SC:ERR:" + tag + ":busy\n": the tag is bounded by the command buffers,
  // so this fits by construction; the check only guards a truncated write.
  std::array<char, kCommandCapacity> text{};
  const int written =
      std::snprintf(text.data(), text.size(), "@SC:ERR:%.*s:busy\n",
                    static_cast<int>(traits_.tag.size()), traits_.tag.data());
  if (written > 0 && static_cast<std::size_t>(written) < text.size()) {
    (void)reply.write(std::span<const std::uint8_t>(
        reinterpret_cast<const std::uint8_t*>(text.data()),
        static_cast<std::size_t>(written)));
  }
}

bool AssetControl::send_ack(const std::uint32_t sequence) {
  const int written = std::snprintf(
      response_.data(), response_.size(),
      "@SC:OK:%.*s:ACK:sequence=%lu,received=%lu\n",
      static_cast<int>(traits_.tag.size()), traits_.tag.data(),
      static_cast<unsigned long>(sequence),
      static_cast<unsigned long>(received_size_));
  return written > 0 && static_cast<std::size_t>(written) < response_.size() &&
         send_text(response_.data());
}

}  // namespace simcore::asset_control
