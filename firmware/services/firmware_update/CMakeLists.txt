idf_component_register(
  SRCS "src/firmware_update_service.cpp"
       "src/firmware_update_control.cpp"
  INCLUDE_DIRS "include"
  REQUIRES app_update asset_control asset_package binary binary_session
           configuration_contract transport
  PRIV_REQUIRES performance)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
